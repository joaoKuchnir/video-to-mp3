//! Typed error surface for Tauri commands.
//!
//! Replaces `Result<_, String>` returns and `.unwrap()` on poisoned locks.
//! `thiserror` derives `Display`+`From`; we hand-roll `Serialize` so the
//! Tauri bridge ships structured errors to the frontend.
//!
//! Why not just keep `String`?
//!  - Compile-time exhaustiveness when adding new variants.
//!  - Frontend can `match` on `kind` instead of parsing free text.
//!  - Future i18n: messages live in one place.
//!
//! Scope note: today only `LockPoisoned` and `Io` are constructed in commands
//! (the only fallible operations that need to surface to the frontend).
//! `Cancelled` is reserved for an upcoming "cancel returns reason" feature.

use serde::{ser::SerializeStruct, Serialize, Serializer};
use std::sync::PoisonError;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    /// A `std::sync::Mutex` was poisoned (another thread panicked while
    /// holding it). Recoverable: the command returns instead of panicking.
    #[error("Erro interno de bloqueio")]
    LockPoisoned,

    /// Reserved: cancel paths may eventually surface a reason to the frontend.
    #[allow(dead_code)]
    #[error("Cancelado")]
    Cancelled,

    /// Filesystem / OS error.
    #[error("Erro de I/O: {0}")]
    Io(#[from] std::io::Error),
}

impl AppError {
    /// Stable identifier consumed by the frontend (`match` over strings).
    fn kind(&self) -> &'static str {
        match self {
            AppError::LockPoisoned => "lockPoisoned",
            AppError::Cancelled => "cancelled",
            AppError::Io(_) => "io",
        }
    }
}

// Any `PoisonError<T>` collapses to `AppError::LockPoisoned` so `?` works
// over `Mutex::lock()` without exposing the inner T.
impl<T> From<PoisonError<T>> for AppError {
    fn from(_: PoisonError<T>) -> Self {
        AppError::LockPoisoned
    }
}

// Serde shape: `{ "kind": "...", "message": "..." }`. Matches the way the
// frontend would parse a typed error envelope.
impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, ser: S) -> Result<S::Ok, S::Error> {
        let mut s = ser.serialize_struct("AppError", 2)?;
        s.serialize_field("kind", self.kind())?;
        s.serialize_field("message", &self.to_string())?;
        s.end()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kind_strings_are_stable() {
        assert_eq!(AppError::LockPoisoned.kind(), "lockPoisoned");
        assert_eq!(AppError::Cancelled.kind(), "cancelled");
        let io = AppError::Io(std::io::Error::other("x"));
        assert_eq!(io.kind(), "io");
    }

    #[test]
    fn display_messages_are_portuguese() {
        assert_eq!(
            AppError::LockPoisoned.to_string(),
            "Erro interno de bloqueio"
        );
        assert_eq!(AppError::Cancelled.to_string(), "Cancelado");
    }

    #[test]
    fn poisoned_lock_converts_to_lock_poisoned() {
        // Build a real PoisonError by panicking inside a mutex guard.
        let m = std::sync::Mutex::new(0);
        let _ = std::thread::scope(|s| {
            s.spawn(|| {
                let _guard = m.lock().unwrap();
                panic!("intentional");
            })
            .join()
        });
        let err = m.lock().unwrap_err();
        let app_err: AppError = err.into();
        assert!(matches!(app_err, AppError::LockPoisoned));
    }

    #[test]
    fn serializes_as_kind_and_message_object() {
        let err = AppError::LockPoisoned;
        let json = serde_json::to_string(&err).unwrap();
        assert!(json.contains("\"kind\":\"lockPoisoned\""));
        assert!(json.contains("\"message\":\"Erro interno de bloqueio\""));
    }
}
