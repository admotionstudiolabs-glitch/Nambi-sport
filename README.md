# ⚽ Ñambi Sport — El Ídolo

Juego de carrera futbolera: DT, Jugador y Presidente. Ligas de Argentina, Paraguay y España,
copas continentales (Libertadores / Champions), Balón de Oro y autoguardado.

## 🚀 Deploy en Netlify (3 opciones)

### Opción A — Netlify Drop (la más rápida, sin repo)

1. Corré `npm install` y `npm run build` en este proyecto.
2. Entrá a **https://app.netlify.com/drop**
3. Arrastrá **SOLO la carpeta `dist/`** (no el proyecto entero).
   - Si preferís un ZIP: comprimí **el contenido** de `dist/` (index.html, assets/, _redirects)
     y arrastrá ese ZIP.
4. Listo: Netlify te da la URL pública.

> ⚠️ Si arrastrás el proyecto completo la página queda **en blanco**, porque el `index.html`
> de la raíz es el de desarrollo y apunta a `/src/main.tsx`, que no existe en producción.

### Opción B — Conectar el repo

1. Subí el proyecto a GitHub/GitLab/Bitbucket.
2. En Netlify: *Add new site → Import an existing project*.
3. No toques nada: el `netlify.toml` ya define build (`npm run build`), publicación (`dist`)
   y Node 20.
4. Deploy.

### Opción C — Netlify CLI

```bash
npm run build
npx netlify-cli deploy --prod --dir=dist
```

## 🔧 Desarrollo local

```bash
npm install
npm run dev
```
