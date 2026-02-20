# Monedita - Análisis de Costos Operativos

> Última actualización: Febrero 2025

Este documento detalla los costos de operación de todos los servicios externos utilizados por Monedita.

---

## Resumen de Servicios

| Servicio | Propósito | Costo Estimado/Operación |
|----------|-----------|--------------------------|
| Claude Sonnet 4 | Agente IA, procesamiento NLP | ~$0.002-0.005/mensaje |
| Claude Vision | OCR de recibos/imágenes | ~$0.005-0.01/imagen |
| Groq Whisper | Transcripción de audio | ~$0.002/minuto (free tier) |
| OpenAI Whisper | Transcripción (fallback) | $0.006/minuto |
| WhatsApp Business API | Mensajería | $0 (service) / $0.0125 (marketing) |
| Supabase | Base de datos | $0 (free tier) / $25/mes (pro) |
| Wompi | Procesamiento de pagos | 2.9% + $900 COP por transacción |

---

## 1. Anthropic Claude API

**Modelo utilizado:** `claude-sonnet-4-20250514`

### Precios por Token

| Tipo | Precio por 1M tokens | Precio por 1K tokens |
|------|---------------------|---------------------|
| Input | $3.00 | $0.003 |
| Output | $15.00 | $0.015 |

### Estimación por Tipo de Operación

#### Mensaje de texto simple
- Input: ~500 tokens (sistema + contexto + mensaje)
- Output: ~200 tokens (respuesta)
- **Costo: ~$0.0015 + $0.003 = $0.0045/mensaje**

#### Mensaje con tool_use (registrar gasto)
- Input: ~800 tokens (sistema + tools + contexto + mensaje)
- Output: ~300 tokens (tool call + respuesta)
- **Costo: ~$0.0024 + $0.0045 = $0.007/mensaje**

#### Procesamiento de imagen (Vision)
- Una imagen típica (800x600): ~640 tokens (`width * height / 750`)
- Input adicional: ~400 tokens (prompt + sistema)
- Output: ~200 tokens
- **Costo: ~$0.003 + $0.003 = $0.006/imagen**

### Optimizaciones Disponibles
- **Prompt Caching:** Hasta 90% de ahorro en tokens repetidos
- **Batch Processing:** 50% de descuento para procesamiento por lotes

### Fuentes
- [Anthropic Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [Claude Vision Docs](https://platform.claude.com/docs/en/build-with-claude/vision)

---

## 2. Groq Whisper API (Transcripción de Audio)

**Modelo:** `whisper-large-v3`

### Precios

| Métrica | Precio |
|---------|--------|
| Por hora de audio | $0.111 |
| Por minuto de audio | ~$0.00185 |
| Mínimo por request | 10 segundos |

### Free Tier
- Sin costo hasta el límite de rate
- Límite de archivo: 25MB (free) / 100MB (dev)
- Rate limits aplican (requests/min, tokens/día)

### Estimación para Monedita
- Audio promedio de WhatsApp: 15-30 segundos
- **Costo por nota de voz: ~$0.001-0.002**

### Fuentes
- [Groq Pricing](https://groq.com/pricing)
- [Groq Speech-to-Text Docs](https://console.groq.com/docs/speech-to-text)

---

## 3. OpenAI Whisper API (Fallback)

**Modelo:** `whisper-1`

### Precios

| Métrica | Precio |
|---------|--------|
| Por minuto de audio | $0.006 |
| Por hora de audio | $0.36 |

### Notas
- Sin free tier - se cobra desde el primer segundo
- Facturación redondeada al segundo más cercano
- 4x más barato que Google Cloud, AWS, o Azure

### Estimación para Monedita
- Audio promedio: 30 segundos
- **Costo por nota de voz: ~$0.003**

### Fuentes
- [OpenAI Pricing](https://platform.openai.com/docs/pricing)
- [Whisper Model](https://platform.openai.com/docs/models/whisper-1)

---

## 4. WhatsApp Business API

### Modelo de Precios (Julio 2025+)
Meta cambió de "por conversación" a "por mensaje" para mensajes iniciados por el negocio.

### Precios para Colombia

| Tipo de Mensaje | Precio/mensaje |
|-----------------|----------------|
| Marketing | $0.0125 USD |
| Utility | $0.0008 USD |
| Authentication | $0.0008 USD |
| Service (respuestas <24h) | **GRATIS** |

### Ventanas de Mensajería Gratuita
- **24 horas:** Respuestas a mensajes del usuario = GRATIS
- **72 horas:** Si el usuario viene de anuncio Click-to-WhatsApp

### Estimación para Monedita
- 95%+ de mensajes son respuestas dentro de 24h
- **Costo efectivo: ~$0/mensaje** (mayoría service)
- Recordatorios/notificaciones: $0.0008-0.0125/mensaje

### Fuentes
- [WhatsApp Business Platform Pricing](https://business.whatsapp.com/products/platform-pricing)
- [WhatsApp Pricing Guide 2025](https://www.linkmobility.com/en-gb/blog/whatsapp-business-api-pricing-2025-guide)

---

## 5. Supabase

### Free Tier

| Recurso | Límite |
|---------|--------|
| Base de datos | 500 MB |
| Almacenamiento | 1 GB |
| Bandwidth | 5 GB/mes |
| MAUs | 50,000 |
| Edge Functions | 500,000 calls/mes |
| Realtime connections | 200 concurrentes |

### Restricciones Free Tier
- Proyectos pausados después de 1 semana de inactividad
- Máximo 2 proyectos activos

### Pro Plan ($25/mes)
- Base de datos: 8 GB
- Almacenamiento: 100 GB
- Bandwidth: 250 GB
- Sin pausas automáticas
- Incluye $10/mes en créditos de compute

### Fuentes
- [Supabase Pricing](https://supabase.com/pricing)
- [Supabase Billing Docs](https://supabase.com/docs/guides/platform/billing-on-supabase)

---

## 6. Wompi (Pagos)

### Comisiones

| Concepto | Costo |
|----------|-------|
| Por transacción exitosa | 2.9% + $900 COP |
| Contracargos | $50,000 COP |
| Desembolsos | Sin costo adicional |

### Notas
- Solo se cobra en transacciones exitosas
- Este costo se transfiere al usuario (no es costo operativo directo)

---

## Análisis de Costos por Tipo de Usuario

### Escenario: Usuario Free (30 mensajes/mes)

| Operación | Cantidad | Costo Unitario | Total |
|-----------|----------|----------------|-------|
| Mensajes de texto | 25 | $0.005 | $0.125 |
| Notas de voz | 5 | $0.004* | $0.020 |
| Imágenes (OCR) | 5 | $0.006 | $0.030 |
| WhatsApp | 35 | $0.00 | $0.00 |
| **TOTAL** | | | **$0.175** |

*Groq + Claude para procesar transcripción

### Escenario: Usuario Basic ($5.99/mes)

| Operación | Cantidad | Costo Unitario | Total |
|-----------|----------|----------------|-------|
| Mensajes de texto | 120 | $0.005 | $0.60 |
| Notas de voz | 30 | $0.004 | $0.12 |
| Imágenes (OCR) | 20 | $0.006 | $0.12 |
| WhatsApp | 170 | $0.00 | $0.00 |
| **TOTAL** | | | **$0.84** |

**Margen: $5.99 - $0.84 = $5.15 (86%)**

### Escenario: Usuario Premium ($12.99/mes)

| Operación | Cantidad | Costo Unitario | Total |
|-----------|----------|----------------|-------|
| Mensajes de texto | 500 | $0.005 | $2.50 |
| Notas de voz | 100 | $0.004 | $0.40 |
| Imágenes (OCR) | 50 | $0.006 | $0.30 |
| WhatsApp | 650 | $0.00 | $0.00 |
| **TOTAL** | | | **$3.20** |

**Margen: $12.99 - $3.20 = $9.79 (75%)**

---

## Escenarios de Riesgo

### 1. Usuario Premium "Power User"
Si un usuario Premium usa TODO al máximo:
- 1000+ mensajes de texto: $5.00
- 100 notas de voz: $0.40
- 50 imágenes: $0.30
- **Total: $5.70** → Margen: $2.29 (29%)

### 2. Abuso de Conversaciones AI
Si un usuario hace solo preguntas complejas sin registrar gastos:
- Cada conversación AI usa más tokens (~1000 input, 500 output)
- Costo: ~$0.01/mensaje
- 500 mensajes = $5.00

### 3. Imágenes de Alta Resolución
- Imagen 4K (3840x2160): ~11,000 tokens
- Costo: ~$0.033 + output = ~$0.04/imagen
- 50 imágenes 4K = $2.00 (vs $0.30 estimado)

---

## Recomendaciones

### Corto Plazo (Actual)
1. **Los límites actuales son sostenibles** - El margen es saludable
2. **Monitorear uso real** - Implementar logging de tokens consumidos
3. **Groq como primario** - Mantener Groq para audio (más barato que OpenAI)

### Mediano Plazo (Escala)
1. **Implementar prompt caching** - Ahorro del 90% en system prompts
2. **Batch processing** para resúmenes diarios/semanales
3. **Comprimir imágenes** antes de enviar a Vision (redimensionar a 800px max)

### Largo Plazo (Si creces mucho)
1. **Considerar sistema de créditos** - Más granular que límites fijos
2. **Ajustar límites por costo real** - Voz e imagen "valen" más que texto
3. **Modelo híbrido** - Claude Haiku para tareas simples ($1/$5 vs $3/$15)

---

## Monitoreo Sugerido

### Métricas a Trackear
```javascript
// Ya implementado en usageMonitor.js
- claude_calls (por día)
- vision_calls (por día)
- whisper_calls (por día)

// Sugerido agregar
- input_tokens_total
- output_tokens_total
- image_tokens_total
- audio_minutes_total
```

### Alertas Recomendadas
- Costo diario > $10
- Usuario individual > $1/día
- Token usage spike > 200% del promedio

---

## Conclusión

Con los límites actuales, Monedita tiene márgenes saludables:
- **Free:** Costo ~$0.20/usuario/mes (subsidiado para conversión)
- **Basic:** Margen ~86% ($5.15 de $5.99)
- **Premium:** Margen ~75% ($9.79 de $12.99)

El modelo actual de límites por tipo de operación es efectivo para controlar costos sin necesidad de implementar un sistema de créditos complejo.
