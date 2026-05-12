# MyWilly — Panel de Inversiones PWA

Aplicación web progresiva (PWA) para seguimiento de inversiones en fondos.
Desplegable en Vercel en menos de 5 minutos.

---

## Requisitos previos

- Node.js 18 o superior
- Cuenta gratuita en [Vercel](https://vercel.com)
- Cuenta gratuita en [GitHub](https://github.com) (para el despliegue)

---

## Despliegue en Vercel (paso a paso)

### 1. Subir el proyecto a GitHub

1. Ve a [github.com](https://github.com) e inicia sesión
2. Pulsa **New repository** → ponle el nombre `mywilly` → **Create repository**
3. En tu ordenador, abre una terminal en la carpeta `mywilly-pwa` y ejecuta:

```bash
npm install
git init
git add .
git commit -m "Initial commit — MyWilly PWA"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/mywilly.git
git push -u origin main
```

### 2. Conectar con Vercel

1. Ve a [vercel.com](https://vercel.com) e inicia sesión con tu cuenta de GitHub
2. Pulsa **Add New Project**
3. Selecciona el repositorio `mywilly` que acabas de crear
4. Vercel detectará automáticamente que es un proyecto Vite. Configuración:
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
5. Pulsa **Deploy** y espera ~2 minutos

### 3. Añadir la API key de Anthropic

La app usa Claude API para noticias, precios y síntesis de voz.
Sin esta clave las funciones de IA no funcionarán.

1. En el dashboard de tu proyecto en Vercel, ve a **Settings → Environment Variables**
2. Añade la variable:
   - **Name:** `VITE_GEMINI_API_KEY`
   - **Value:** tu API key de Google Gemini (gratuita — la obtienes en [aistudio.google.com](https://aistudio.google.com) → Get API key)
3. Haz un nuevo despliegue para que la variable tenga efecto

> ⚠️ **Importante sobre la API key:** Incluir la API key directamente en una app frontend
> significa que cualquiera que visite tu URL podría usarla. Para uso personal con una URL
> privada esto es aceptable. Si compartes la URL públicamente, considera añadir autenticación.

### 4. Actualizar la app para usar la variable de entorno

En el archivo `src/MyWilly.jsx`, busca todas las llamadas a la API de Anthropic:
```javascript
headers: { "Content-Type": "application/json" },
```
Y añade la Authorization header:
```javascript
headers: {
  "Content-Type": "application/json",
  "anthropic-dangerous-direct-browser-access": "true",
  "x-api-key": import.meta.env.VITE_GEMINI_API_KEY,
},
```

---

## Instalar como app en el escritorio (iOS)

Una vez desplegada en Vercel:

1. Abre la URL de tu app en **Safari** (no Chrome ni Firefox)
2. Pulsa el botón **Compartir** (cuadrado con flecha hacia arriba)
3. Selecciona **"Añadir a pantalla de inicio"**
4. Dale el nombre **MyWilly** y pulsa **Añadir**

La app aparecerá en tu escritorio con el icono de MyWilly, se abrirá a pantalla completa sin barra del navegador y funcionará como una app nativa.

### En Android

1. Abre la URL en **Chrome**
2. Pulsa el menú de tres puntos (⋮)
3. Selecciona **"Añadir a pantalla de inicio"**

---

## Estructura del proyecto

```
mywilly-pwa/
├── index.html              # Punto de entrada HTML con meta tags PWA
├── package.json            # Dependencias (React, Recharts, Vite)
├── vite.config.js          # Configuración de Vite + plugin PWA
├── vercel.json             # Configuración de routing para Vercel
├── src/
│   ├── main.jsx            # Punto de entrada React
│   └── MyWilly.jsx         # Aplicación completa (~2.037 líneas)
└── public/
    └── icons/              # Iconos en todos los tamaños iOS/Android
        ├── icon_app.png         (1024×1024 — master)
        ├── icon_app_512.png     (Google Play)
        ├── icon_app_192.png     (PWA / Android)
        ├── icon_app_180.png     (iOS iPhone @3x)
        ├── icon_app_167.png     (iOS iPad Pro)
        ├── icon_app_152.png     (iOS iPad @2x)
        └── icon_app_120.png     (iOS iPhone @2x)
```

---

## Dependencias

| Paquete | Versión | Uso |
|---------|---------|-----|
| react | ^18.2 | Framework UI |
| react-dom | ^18.2 | Renderizado DOM |
| recharts | ^2.12 | Gráficas de NAV |
| vite | ^5.2 | Bundler |
| @vitejs/plugin-react | ^4.2 | Plugin React para Vite |
| vite-plugin-pwa | ^0.20 | Generación de Service Worker y manifest |

---

## Funcionalidades

- Seguimiento de 4 fondos con datos reales de MyInvestor
- Actualización automática de precios NAV vía Claude API + búsqueda web
- Noticias geopolíticas diarias con análisis de impacto por fondo
- Gráfica de precio por participación (NAV) con histórico
- Resumen fiscal con plusvalías latentes/realizadas y estimación IRPF
- Widget de resumen rápido
- Síntesis de voz con reescritura oral natural vía Claude API
- Gestión dinámica de fondos (añadir/eliminar)
- Wizard de aportaciones con cálculo automático de participaciones

---

*Generado con Claude · Anthropic*
