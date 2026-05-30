# Video → MP3

App desktop (macOS / Windows / Linux) que converte links de vídeo (YouTube e 1000+ sites)
em MP3 320/192 kbps, com fila paralela, UI dark moderna e notificações.

Construído com **Tauri 2** (Rust) + **React** + **Vite**. Motores `yt-dlp` + `ffmpeg`
(+ `deno` como JS runtime do yt-dlp para YouTube) embutidos como sidecars.

## Desenvolvimento

```bash
npm install
bash scripts/fetch-sidecars.sh      # baixa yt-dlp/ffmpeg/deno do SO atual
npm run tauri dev
```

No Windows: `powershell -ExecutionPolicy Bypass -File scripts/fetch-sidecars.ps1`.

## Build local (apenas o SO atual)

```bash
bash scripts/fetch-sidecars.sh
npm run tauri build
```

Instaladores saem em `src-tauri/target/release/bundle/`
(`.dmg`/`.app`, `.msi`/`.exe`, `.deb`/`.AppImage`).

## Build dos 3 SOs (CI)

O workflow [`.github/workflows/build.yml`](.github/workflows/build.yml) builda
macOS (Intel + Apple Silicon), Windows e Linux em runners nativos.

- **Release:** crie uma tag `vX.Y.Z` e dê push → gera um GitHub Release (rascunho)
  com todos os instaladores.
- **Teste:** dispare manualmente (`workflow_dispatch`) na aba Actions → instaladores
  ficam como artifacts.

```bash
git tag v0.1.0
git push origin v0.1.0
```

## Notas

- Sidecars **não** são commitados (grandes, por plataforma). São baixados pelos
  scripts `fetch-sidecars.*` local e na CI.
- Notificações do SO no macOS exigem build assinado para funcionar plenamente;
  em dev usa-se o toast in-app.
