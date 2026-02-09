# Despliegue de Landing Page - FinanceFlow

## URL de Produccion
https://landing-nu-lovat.vercel.app

## Despliegue Rapido

```bash
# Desde la carpeta landing
cd /Users/nohora/Development/financeflow-mvp/landing

# Desplegar a produccion
vercel --prod
```

## Comandos Utiles

| Comando | Descripcion |
|---------|-------------|
| `vercel` | Deploy preview (para probar antes de produccion) |
| `vercel --prod` | Deploy a produccion |
| `vercel logs` | Ver logs del ultimo deploy |
| `vercel ls` | Listar todos los deployments |
| `vercel rollback` | Revertir al deploy anterior |

## Agregar Dominio Personalizado

```bash
# Agregar dominio
vercel domains add tudominio.com

# Verificar dominios
vercel domains ls
```

## Estructura del Proyecto

```
landing/
├── index.html      # Landing page (todo en un archivo)
├── DEPLOY.md       # Este archivo
└── .vercel/        # Configuracion de Vercel (auto-generado)
```

## Variables de Entorno (si se necesitan)

```bash
# Agregar variable
vercel env add VARIABLE_NAME

# Listar variables
vercel env ls
```

## Troubleshooting

**Error de autenticacion:**
```bash
vercel login
```

**Forzar redespliegue limpio:**
```bash
vercel --force --prod
```

**Ver configuracion actual:**
```bash
vercel project ls
```
