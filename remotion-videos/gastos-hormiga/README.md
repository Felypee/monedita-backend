# 🐜 Video: Gastos Hormiga

Video viral de 15 segundos para TikTok/Reels sobre gastos hormiga, creado con Remotion.

## Inicio Rápido

```bash
cd remotion-videos/gastos-hormiga
npm install
npm start
```

## Comandos

| Comando | Descripción |
|---------|-------------|
| `npm start` | Abrir Remotion Studio (preview) |
| `npm run build` | Renderizar video MP4 |
| `npm run build:gif` | Renderizar como GIF |

## Assets Necesarios

### 🎬 Animaciones Lottie (Gratuitas)

Descarga los JSON y guárdalos en `public/lottie/`:

| Animación | URL | Archivo |
|-----------|-----|---------|
| Wallet with Coins | [lottiefiles.com/free-animation/wallet-with-coins-NCg1syLxHS](https://lottiefiles.com/free-animation/wallet-with-coins-NCg1syLxHS) | `wallet-with-coins.json` |
| Coin Circling Wallet | [lottiefiles.com/10558-coin-circling-wallet](https://lottiefiles.com/10558-coin-circling-wallet) | `coin-circling-wallet.json` |
| Wallet Money Added | [lottiefiles.com/23210-wallet-money-added](https://lottiefiles.com/23210-wallet-money-added) | `wallet-money-added.json` |

**Cómo descargar:**
1. Ve al link
2. Click en "Download"
3. Selecciona "Lottie JSON"
4. Guarda en `public/lottie/`

### 🎨 Ilustraciones Blush (Gratuitas)

Descarga PNGs de [blush.design](https://blush.design/es) y guárdalos en `public/illustrations/`:

| Ilustración | Colección Recomendada | Archivo |
|-------------|----------------------|---------|
| Persona con café | [Open Peeps](https://blush.design/es/collections/open-peeps/open-peeps) | `coffee-person.png` |
| Bolsa de compras | [Shopaholics](https://blush.design/es/collections/xkMGNwLF1oKK8hcfXpGF/shopaholics) | `shopping-bag.png` |
| Persona preocupada | [Amigos](https://blush.design/es/collections/kSlBLJlsKBVuI0j1MQlv/amigos) | `worried-person.png` |
| Snacks/comida | [Fresh Folk](https://blush.design/es/collections/8lWF2CQikq2jdHJF2as4/fresh-folk) | `snack-food.png` |
| Dinero/monedas | [Moneyverse](https://blush.design/es/collections/84IJMkKVb6DBXawZIcjY/84IJMkKVb6DBXawZIcjY) | `money-coins.png` |

**Cómo descargar:**
1. Ve a la colección
2. Selecciona una ilustración
3. Personaliza colores si quieres
4. Click "Download PNG" (gratis hasta 5)
5. Guarda en `public/illustrations/`

### 🎵 Audio (Opcional)

Para añadir música de fondo:
1. Busca un beat de 80-100 BPM (recomendado para engagement)
2. Guarda como `public/audio/beat.mp3`
3. Descomenta la línea de `<Audio>` en `src/Video.tsx`

## Estructura del Video

```
0-1s   → Escena 1: Flash + número rojo "-$847" (Loss Aversion)
1-3s   → Escena 2: Wallet Lottie + "Eso perdiste el mes pasado"
3-5s   → Escena 3: "¿En qué?" con pausa dramática (Zeigarnik)
5-8s   → Escena 4: Items con ilustraciones Blush
8-11s  → Escena 5: Contador subiendo $2→$847
11-14s → Escena 6: "Las hormigas se llevan tu quincena"
14-15s → Escena 7: CTA "¿Cuánto perdiste tú?"
```

## Principios de Neurociencia Aplicados

| Principio | Escena | Efecto |
|-----------|--------|--------|
| **Loss Aversion** | 1, 5 | Números rojos, pérdidas visibles |
| **Zeigarnik Effect** | 3 | Pregunta abierta, pausa |
| **Variable Reward** | 5 | Contador que sube impredeciblemente |
| **Pattern Interrupt** | 1 | Flash inicial, cambio brusco |
| **Neural Coupling** | 6 | Metáfora de hormigas |

## Personalización

### Cambiar el monto
En `src/Video.tsx`, línea 17:
```tsx
<Scene1_LossNumber amount={847} />  // Cambiar a tu número
```

### Cambiar los items
En `src/sequences/Scene4_Items.tsx`:
```tsx
const items = [
  { emoji: "☕", text: "Cafés", ... },
  { emoji: "🍫", text: "Snacks", ... },
  // Añade o modifica items aquí
];
```

### Cambiar valores del contador
En `src/sequences/Scene5_Counter.tsx`:
```tsx
const counterValues = [2, 5, 15, 50, 150, 350, 600, 847];
```

## Exportar para TikTok

```bash
# Video vertical 1080x1920 (perfecto para TikTok/Reels)
npm run build
```

El video se guarda en `out/gastos-hormiga.mp4`

## Fuentes

El video usa **Inter** de Google Fonts. Para instalarla localmente:
- [fonts.google.com/specimen/Inter](https://fonts.google.com/specimen/Inter)

O usa la fuente del sistema que es similar.
