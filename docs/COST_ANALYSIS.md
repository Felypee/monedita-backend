# Monedita - Sistema de Moneditas Basado en Costos Reales

> Ultima actualizacion: Febrero 2026

## Resumen Rapido

### Sistema de Moneditas

**1 Monedita = $0.002 USD** (costo real de operacion)

| Operacion | Costo Real | Moneditas | Costo Cobrado |
|-----------|------------|-----------|---------------|
| **Texto** | $0.010 | **5** | $0.010 |
| **Imagen/recibo** | $0.011 | **6** | $0.012 |
| **Audio** | $0.008 | **4** | $0.008 |
| **Resumen semanal** | $0.010 | **5** | $0.010 |

### Planes

| Plan | Precio | Moneditas/mes | Uso Tipico |
|------|--------|---------------|------------|
| **Free** | $0 | 50 | ~10 gastos texto |
| **Basic** | $2.99 | 1,200 | ~240 gastos texto |
| **Premium** | $7.99 | 3,500 | ~700 gastos texto |

### Margenes Reales (con Wompi incluido)

| Plan | Ingreso Neto | Costo Total | Margen |
|------|--------------|-------------|--------|
| Free | $0 | $0.15 | -$0.15 |
| Basic | $2.62 | $2.45 | **+$0.17 (6%)** |
| Premium | $7.45 | $7.05 | **+$0.40 (5%)** |

---

## Tabla de Contenidos

1. [Costos Reales por Operacion](#costos-reales-por-operacion)
2. [Sistema de Moneditas](#sistema-de-moneditas)
3. [Planes de Suscripcion](#planes-de-suscripcion)
4. [Analisis de Rentabilidad](#analisis-de-rentabilidad)
5. [Escenarios de Usuarios](#escenarios-de-usuarios)
6. [Costos de Infraestructura](#costos-de-infraestructura)
7. [Implementacion Tecnica](#implementacion-tecnica)

---

## Costos Reales por Operacion

### APIs y sus costos (Febrero 2026)

| Servicio | Modelo | Costo |
|----------|--------|-------|
| Claude API | Sonnet 4 | $3/M input, $15/M output |
| Claude Vision | Sonnet 4 | Mismo + ~1600 tokens/imagen |
| OpenAI Whisper | whisper-1 | $0.006/minuto (~$0.003 por 30seg) |
| WhatsApp | Business API | **$0.0008/mensaje** (Colombia) |

> Nota: Groq Whisper es gratis pero lo contamos como bonus, no como baseline.

### Costo Calculado por Operacion (Completo)

| Operacion | Claude | Whisper | WhatsApp (resp) | **TOTAL** |
|-----------|--------|---------|-----------------|-----------|
| **Texto** | $0.009 | $0 | $0.0008 | **$0.010** |
| **Imagen/OCR** | $0.010 | $0 | $0.0008 | **$0.011** |
| **Audio (30seg)** | $0.004 | $0.003 | $0.0008 | **$0.008** |
| **Resumen semanal** | $0.009 | $0 | $0.0008 | **$0.010** |

### Desglose de Tokens (Claude)

| Operacion | Tokens Input | Tokens Output | Costo Input | Costo Output | Total |
|-----------|--------------|---------------|-------------|--------------|-------|
| Texto | ~1,400 | ~300 | $0.0042 | $0.0045 | $0.0087 |
| Imagen | ~2,500 | ~150 | $0.0075 | $0.0023 | $0.0098 |
| Audio | ~600 | ~150 | $0.0018 | $0.0023 | $0.0041 |

---

## Sistema de Moneditas

### Filosofia: 1 Monedita = $0.002 USD

Cada monedita representa un costo real de operacion. Esto permite:

1. **Control exacto** - Sabes exactamente cuanto cuesta cada operacion
2. **Costo fijo predecible** - Si el usuario gasta todo, ya sabes el costo maximo
3. **Transparencia** - Puedes explicar exactamente que cubre cada monedita
4. **Escalabilidad** - Ajustas el valor si cambian los precios de APIs

### Costos por Operacion en Moneditas

```javascript
// src/services/moneditasService.js
const OPERATION_COSTS = {
  TEXT_MESSAGE: 5,      // ~$0.010 (Claude $0.009 + WA $0.0008)
  IMAGE_RECEIPT: 6,     // ~$0.012 (Claude Vision $0.010 + WA $0.0008)
  AUDIO_MESSAGE: 4,     // ~$0.008 (Whisper $0.003 + Claude $0.004 + WA $0.0008)
  WEEKLY_SUMMARY: 5,    // ~$0.010 (Claude $0.009 + WA $0.0008)
  REMINDER: 1,          // ~$0.002 (Simple text, sin Claude)
};
```

### Que Incluye Cada Operacion

| Operacion | Incluye |
|-----------|---------|
| TEXT_MESSAGE | Claude API + respuesta WhatsApp |
| IMAGE_RECEIPT | Claude Vision + respuesta WhatsApp |
| AUDIO_MESSAGE | Whisper transcription + Claude + respuesta WhatsApp |
| WEEKLY_SUMMARY | Claude analisis + mensaje WhatsApp |

---

## Planes de Suscripcion

### Definicion de Planes

| Caracteristica | **Free** | **Basic** | **Premium** |
|----------------|----------|-----------|-------------|
| **Precio** | $0 | $2.99/mes | $7.99/mes |
| **Precio COP** | $0 | ~$12,000 | ~$32,000 |
| **Moneditas/mes** | 50 | 1,200 | 3,500 |
| **Historial** | 30 dias | 6 meses | 12 meses |
| **Presupuestos** | Ilimitado | Ilimitado | Ilimitado |
| **Resumen semanal** | Si | Si | Si |
| **Export CSV** | Si | Si | Si |
| **Export PDF** | No | Si | Si |

### Que Puede Hacer Cada Plan

| Accion | Free (50) | Basic (1,200) | Premium (3,500) |
|--------|-----------|---------------|-----------------|
| Texto (5 c/u) | 10 gastos | 240 gastos | 700 gastos |
| Imagenes (6 c/u) | 8 recibos | 200 recibos | 583 recibos |
| Audio (4 c/u) | 12 audios | 300 audios | 875 audios |
| **Mixto tipico*** | ~8 ops | ~190 ops | ~550 ops |

*Mixto tipico: 70% texto, 20% imagen, 10% audio

### Calculo de Uso Mixto

```
Free (50 moneditas):
- 7 textos × 5 = 35 moneditas
- 1 imagen × 6 = 6 moneditas
- 2 audios × 4 = 8 moneditas
= 49 moneditas (~8 operaciones)

Basic (1,200 moneditas):
- 168 textos × 5 = 840 moneditas
- 40 imagenes × 6 = 240 moneditas
- 30 audios × 4 = 120 moneditas
= 1,200 moneditas (~238 operaciones)

Premium (3,500 moneditas):
- 490 textos × 5 = 2,450 moneditas
- 117 imagenes × 6 = 702 moneditas
- 87 audios × 4 = 348 moneditas
= 3,500 moneditas (~694 operaciones)
```

---

## Analisis de Rentabilidad

### Costo por Usuario por Plan

#### Plan Free ($0)

| Concepto | Calculo | Total |
|----------|---------|-------|
| Moneditas usadas (80% = 40) | 40 × $0.002 | $0.08 |
| Infraestructura prorrateada | - | $0.05 |
| **TOTAL COSTO** | | **~$0.13/mes** |
| Ingreso | | **$0** |
| **MARGEN** | | **-$0.13** |

#### Plan Basic ($2.99)

| Concepto | Calculo | Total |
|----------|---------|-------|
| Moneditas usadas (100% = 1,200) | 1,200 × $0.002 | $2.40 |
| Infraestructura prorrateada | - | $0.05 |
| **TOTAL COSTO** | | **~$2.45/mes** |
| Precio bruto | | $2.99 |
| Comision Wompi (~12%) | | -$0.37 |
| **INGRESO NETO** | | **$2.62** |
| **MARGEN** | | **+$0.17 (6%)** |

#### Plan Premium ($7.99)

| Concepto | Calculo | Total |
|----------|---------|-------|
| Moneditas usadas (100% = 3,500) | 3,500 × $0.002 | $7.00 |
| Infraestructura prorrateada | - | $0.05 |
| **TOTAL COSTO** | | **~$7.05/mes** |
| Precio bruto | | $7.99 |
| Comision Wompi (~7%) | | -$0.54 |
| **INGRESO NETO** | | **$7.45** |
| **MARGEN** | | **+$0.40 (5%)** |

### Resumen de Margenes

| Plan | Ingreso Neto | Costo Total | Margen USD | Margen % |
|------|--------------|-------------|------------|----------|
| Free | $0 | $0.13 | -$0.13 | N/A |
| Basic | $2.62 | $2.45 | **+$0.17** | **6%** |
| Premium | $7.45 | $7.05 | **+$0.40** | **5%** |

---

## Escenarios de Usuarios

### Distribucion Esperada

| Escenario | Free | Basic | Premium | Total |
|-----------|------|-------|---------|-------|
| **100 usuarios** | 75 (75%) | 18 (18%) | 7 (7%) | 100 |
| **500 usuarios** | 350 (70%) | 110 (22%) | 40 (8%) | 500 |
| **2000 usuarios** | 1300 (65%) | 500 (25%) | 200 (10%) | 2000 |

### Escenario 1: 100 Usuarios

#### Ingresos

| Plan | Usuarios | Precio | Bruto | Wompi | **Neto** |
|------|----------|--------|-------|-------|----------|
| Free | 75 | $0 | $0 | $0 | $0 |
| Basic | 18 | $2.99 | $53.82 | $6.66 | $47.16 |
| Premium | 7 | $7.99 | $55.93 | $3.78 | $52.15 |
| **TOTAL** | **100** | | $109.75 | $10.44 | **$99.31** |

#### Costos

| Tipo | Detalle | Costo |
|------|---------|-------|
| **Fijos** | Railway + Dominio | $6.25 |
| **Variables** | Free (75 × $0.13) | $9.75 |
| | Basic (18 × $2.45) | $44.10 |
| | Premium (7 × $7.05) | $49.35 |
| **TOTAL** | | **$109.45** |

#### Resultado

| Metrica | Valor |
|---------|-------|
| Ingreso neto | $99.31 |
| Costos totales | $109.45 |
| **Ganancia** | **-$10.14** |

> Nota: Con 100 usuarios hay perdida porque los costos fijos ($6.25) no se diluyen suficiente. Break-even ~150 usuarios.

### Escenario 2: 500 Usuarios

#### Resultado

| Metrica | Valor |
|---------|-------|
| Ingreso neto | $586.20 |
| Costos fijos | $46.25 |
| Costos variables | $517.45 |
| **Ganancia** | **+$22.50** |
| **Margen** | **4%** |

### Escenario 3: 2000 Usuarios

#### Resultado

| Metrica | Valor |
|---------|-------|
| Ingreso neto | $2,800.00 |
| Costos fijos | $101.25 |
| Costos variables | $2,379.50 |
| **Ganancia** | **+$319.25** |
| **Margen** | **11%** |

---

## Costos de Infraestructura

### Costos Fijos Actuales: $6.25/mes

| Servicio | Costo | Notas |
|----------|-------|-------|
| Railway | $5.00 | Hosting Node.js |
| Supabase | $0.00 | Free tier |
| Dominio | $1.25 | $15/año |
| **TOTAL** | **$6.25** | |

### Escalado de Costos Fijos

| Usuarios | Railway | Supabase | Dominio | **Total** |
|----------|---------|----------|---------|-----------|
| 100 | $5 | $0 | $1.25 | $6.25 |
| 500 | $20 | $25 | $1.25 | $46.25 |
| 2000 | $50 | $50 | $1.25 | $101.25 |

### Costo de Infraestructura por Usuario

| Escala | Costo Fijo Total | Por Usuario |
|--------|------------------|-------------|
| 100 usuarios | $6.25 | $0.06 |
| 500 usuarios | $46.25 | $0.09 |
| 2000 usuarios | $101.25 | $0.05 |

---

## Implementacion Tecnica

### Archivos Clave

```
src/services/moneditasService.js    # Servicio principal de moneditas
src/database/subscriptionDB.*.js    # DB con MoneditasDB
src/handlers/messageHandler.js      # Usa checkMoneditas/consumeMoneditas
sql/subscriptions_schema.sql        # Schema con moneditas_usage table
```

### Flujo de Consumo

```
1. Usuario envia mensaje
   ↓
2. checkMoneditas(phone, OPERATION_COSTS.TEXT_MESSAGE)
   ↓
3. ¿Tiene 5+ moneditas?
   → NO: Mensaje "Te quedaste sin moneditas" + upgrade CTA
   → SI: Continuar
   ↓
4. Procesar mensaje con Claude API
   ↓
5. consumeMoneditas(phone, OPERATION_COSTS.TEXT_MESSAGE, "text_message")
   ↓
6. Enviar respuesta via WhatsApp
```

### Constantes de Costos

```javascript
// 1 monedita = $0.002 USD
const OPERATION_COSTS = {
  TEXT_MESSAGE: 5,      // $0.010
  IMAGE_RECEIPT: 6,     // $0.012
  AUDIO_MESSAGE: 4,     // $0.008
  WEEKLY_SUMMARY: 5,    // $0.010
  REMINDER: 1,          // $0.002
};
```

### Estructura de Datos

```javascript
// Planes
const PLANS = {
  free: {
    moneditasMonthly: 50,
    historyDays: 30,
    priceMonthly: 0,
  },
  basic: {
    moneditasMonthly: 1200,
    historyDays: 180,
    priceMonthly: 2.99,
  },
  premium: {
    moneditasMonthly: 3500,
    historyDays: 365,
    priceMonthly: 7.99,
  },
};
```

---

## Comisiones Wompi

### Tarifas (Colombia, Febrero 2026)

| Metodo | Comision | Fijo |
|--------|----------|------|
| Tarjeta | 2.9% | + $900 COP |
| PSE | 0% | $2,500 COP |
| Nequi | 2.5% | $0 |

> IVA del 19% aplica sobre la comision

### Impacto por Plan

| Plan | Precio COP | Comision + IVA | **Neto** |
|------|------------|----------------|----------|
| Basic | $12,000 | $1,485 | $10,515 |
| Premium | $32,000 | $2,175 | $29,825 |

---

## Comparacion: Sistema Anterior vs Nuevo

| Aspecto | Antes | Ahora |
|---------|-------|-------|
| Limites | 5 separados | 1 universal (moneditas) |
| Texto | 1 "monedita" | 5 moneditas |
| Imagen | 3 "moneditas" | 6 moneditas |
| Audio | 2 "moneditas" | 4 moneditas |
| Correlacion con costo | No | Si ($0.002/monedita) |
| Budgets | Limitados | Ilimitados |
| WhatsApp incluido | No | Si |
| Whisper incluido | No | Si |

### Por que el Cambio

1. **Costos predecibles** - Cada monedita = costo real
2. **Sin sorpresas** - Si user gasta todo, ya sabes el costo max
3. **Transparente** - Puedes explicar que cubre cada monedita
4. **Escalable** - Ajustas valor si cambian APIs
5. **Simple** - 1 contador en vez de 5

---

## Fuentes

- [Claude API Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [WhatsApp Business API Pricing Colombia](https://www.heltar.com/blogs/whatsapp-api-pricing-in-columbia-2025-cm73iygsn0080r1l2vyv39xpd)
- [Groq Pricing](https://groq.com/pricing)
- [Supabase Pricing](https://supabase.com/pricing)
- [Wompi Tarifas Colombia](https://wompi.com/es/co/tarifas)

---

*Analisis basado en precios de APIs de Febrero 2026. Los costos reales pueden variar segun comportamiento de usuarios y cambios en pricing de APIs.*
