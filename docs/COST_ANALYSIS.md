# FinanceFlow Cost & Profitability Analysis

> Last Updated: February 2026

## Table of Contents

1. [Service Costs Overview](#service-costs-overview)
2. [Cost Per Message Type](#cost-per-message-type)
3. [Subscription Plans](#subscription-plans)
4. [User Scenarios Analysis](#user-scenarios-analysis)
5. [Profitability Summary](#profitability-summary)

---

## Service Costs Overview

### API Pricing (Current as of Feb 2026)

| Service            | Model          | Pricing                                |
| ------------------ | -------------- | -------------------------------------- |
| **Claude API**     | Sonnet 4       | $3/M input tokens, $15/M output tokens |
| **WhatsApp API**   | Business       | Free (service messages within 24h)     |
| **Groq Whisper**   | Large v3 Turbo | $0.04/hour (~$0.00067/min)             |
| **OpenAI Whisper** | Whisper-1      | $0.006/minute (fallback)               |

### Token Estimates Per Operation

| Operation                        | Input  | Output |
| -------------------------------- | ------ | ------ |
| Text expense detection           | ~600   | ~150   |
| AI conversation (processMessage) | ~800   | ~300   |
| Image receipt OCR                | ~2,500 | ~150   |
| Audio expense extraction         | ~600   | ~150   |

---

## Cost Per Message Type

### 1. Text Message (Expense Detection)

```
Claude API:
- Input:  600 tokens  x ($3/1M)  = $0.0018
- Output: 150 tokens  x ($15/1M) = $0.00225
                                   ─────────
                         Subtotal = $0.00405

WhatsApp: FREE (service message)
                         ─────────
              TOTAL COST = $0.0041
```

### 2. AI Conversation Message

```
Claude API:
- Input:  800 tokens  x ($3/1M)  = $0.0024
- Output: 300 tokens  x ($15/1M) = $0.0045
                                   ─────────
                         Subtotal = $0.0069

WhatsApp: FREE (service message)
                         ─────────
              TOTAL COST = $0.0069
```

### 3. Image/Receipt Processing (Claude Vision)

```
Claude API:
- Input:  2,500 tokens x ($3/1M)  = $0.0075
- Output: 150 tokens   x ($15/1M) = $0.00225
                                    ─────────
                          Subtotal = $0.00975

WhatsApp: FREE (service message)
                          ─────────
               TOTAL COST = $0.0098
```

### 4. Audio/Voice Message Processing

```
Groq Whisper (avg 30 sec):
- Transcription: 0.5 min x $0.00067 = $0.00034

Claude API:
- Input:  600 tokens x ($3/1M)  = $0.0018
- Output: 150 tokens x ($15/1M) = $0.00225
                                  ─────────
                        Subtotal = $0.00439

WhatsApp: FREE (service message)
                        ─────────
             TOTAL COST = $0.0044
```

### Cost Summary Table

| Message Type | Cost/Message | Notes                   |
| ------------ | ------------ | ----------------------- |
| **Text**     | $0.0041      | Expense detection       |
| **AI Chat**  | $0.0069      | Conversational response |
| **Image**    | $0.0098      | Receipt OCR             |
| **Audio**    | $0.0044      | Voice note (30s avg)    |

---

## Subscription Plans

### Plan Definitions

| Feature              | Free     | Basic     | Premium   |
| -------------------- | -------- | --------- | --------- |
| **Monthly Price**    | $0       | $2.99     | $7.99     |
| **Text Messages**    | 30/month | 150/month | Unlimited |
| **Voice Messages**   | 5/month  | 30/month  | 100/month |
| **Image/Receipts**   | 5/month  | 20/month  | 50/month  |
| **AI Conversations** | 10/month | 50/month  | Unlimited |
| **Budget Alerts**    | 1 budget | 5 budgets | Unlimited |
| **Export Data**      | No       | CSV       | CSV + PDF |
| **Priority Support** | No       | No        | Yes       |

### Average Usage Estimates Per User

| Plan        | Text | AI Chat | Images | Audio |
| ----------- | ---- | ------- | ------ | ----- |
| **Free**    | 25   | 8       | 3      | 2     |
| **Basic**   | 100  | 30      | 12     | 15    |
| **Premium** | 200  | 80      | 35     | 50    |

### Cost Per User Per Month

#### Free Tier User

```
Text:    25 x $0.0041 = $0.1025
AI Chat:  8 x $0.0069 = $0.0552
Images:   3 x $0.0098 = $0.0294
Audio:    2 x $0.0044 = $0.0088
                        ────────
           TOTAL COST = $0.1959
```

#### Basic Tier User

```
Text:   100 x $0.0041 = $0.41
AI Chat: 30 x $0.0069 = $0.207
Images:  12 x $0.0098 = $0.1176
Audio:   15 x $0.0044 = $0.066
                        ────────
           TOTAL COST = $0.80
```

#### Premium Tier User

```
Text:   200 x $0.0041 = $0.82
AI Chat: 80 x $0.0069 = $0.552
Images:  35 x $0.0098 = $0.343
Audio:   50 x $0.0044 = $0.22
                        ────────
           TOTAL COST = $1.94
```

### Per-User Economics

| Plan        | Price | API Cost | Gross Margin | Margin % |
| ----------- | ----- | -------- | ------------ | -------- |
| **Free**    | $0.00 | $0.20    | -$0.20       | N/A      |
| **Basic**   | $2.99 | $0.80    | +$2.19       | 73.2%    |
| **Premium** | $7.99 | $1.94    | +$6.05       | 75.7%    |

---

## User Scenarios Analysis

### Assumed User Distribution

| Scenario       | Free       | Basic      | Premium   | Total |
| -------------- | ---------- | ---------- | --------- | ----- |
| **50 users**   | 35 (70%)   | 10 (20%)   | 5 (10%)   | 50    |
| **500 users**  | 300 (60%)  | 150 (30%)  | 50 (10%)  | 500   |
| **5000 users** | 2500 (50%) | 2000 (40%) | 500 (10%) | 5000  |

---

### Scenario 1: 50 Users

#### Revenue

| Plan      | Users  | Price | Monthly Revenue |
| --------- | ------ | ----- | --------------- |
| Free      | 35     | $0.00 | $0.00           |
| Basic     | 10     | $2.99 | $29.90          |
| Premium   | 5      | $7.99 | $39.95          |
| **Total** | **50** |       | **$69.85**      |

#### API Costs

| Plan      | Users  | Cost/User | Monthly Cost |
| --------- | ------ | --------- | ------------ |
| Free      | 35     | $0.20     | $7.00        |
| Basic     | 10     | $0.80     | $8.00        |
| Premium   | 5      | $1.94     | $9.70        |
| **Total** | **50** |           | **$24.70**   |

#### Infrastructure Costs

| Item                     | Monthly Cost |
| ------------------------ | ------------ |
| Hosting (Heroku/Railway) | $12.00       |
| Database (Supabase free) | $0.00        |
| Domain/SSL               | $1.00        |
| **Total**                | **$13.00**   |

#### Profit Summary - 50 Users

| Metric            | Amount     |
| ----------------- | ---------- |
| Revenue           | $69.85     |
| API Costs         | $24.70     |
| Infrastructure    | $13.00     |
| **Total Costs**   | **$37.70** |
| **Net Profit**    | **$32.15** |
| **Profit Margin** | **46.0%**  |

---

### Scenario 2: 500 Users

#### Revenue

| Plan      | Users   | Price | Monthly Revenue |
| --------- | ------- | ----- | --------------- |
| Free      | 300     | $0.00 | $0.00           |
| Basic     | 150     | $2.99 | $448.50         |
| Premium   | 50      | $7.99 | $399.50         |
| **Total** | **500** |       | **$848.00**     |

#### API Costs

| Plan      | Users   | Cost/User | Monthly Cost |
| --------- | ------- | --------- | ------------ |
| Free      | 300     | $0.20     | $60.00       |
| Basic     | 150     | $0.80     | $120.00      |
| Premium   | 50      | $1.94     | $97.00       |
| **Total** | **500** |           | **$277.00**  |

#### Infrastructure Costs

| Item                    | Monthly Cost |
| ----------------------- | ------------ |
| Hosting (scaled)        | $25.00       |
| Database (Supabase Pro) | $25.00       |
| Domain/SSL              | $1.00        |
| Monitoring              | $10.00       |
| **Total**               | **$61.00**   |

#### Profit Summary - 500 Users

| Metric            | Amount      |
| ----------------- | ----------- |
| Revenue           | $848.00     |
| API Costs         | $277.00     |
| Infrastructure    | $61.00      |
| **Total Costs**   | **$338.00** |
| **Net Profit**    | **$510.00** |
| **Profit Margin** | **60.1%**   |

---

### Scenario 3: 5000 Users

#### Revenue

| Plan      | Users    | Price | Monthly Revenue |
| --------- | -------- | ----- | --------------- |
| Free      | 2500     | $0.00 | $0.00           |
| Basic     | 2000     | $2.99 | $5,980.00       |
| Premium   | 500      | $7.99 | $3,995.00       |
| **Total** | **5000** |       | **$9,975.00**   |

#### API Costs

| Plan      | Users    | Cost/User | Monthly Cost  |
| --------- | -------- | --------- | ------------- |
| Free      | 2500     | $0.20     | $500.00       |
| Basic     | 2000     | $0.80     | $1,600.00     |
| Premium   | 500      | $1.94     | $970.00       |
| **Total** | **5000** |           | **$3,070.00** |

#### Infrastructure Costs

| Item                      | Monthly Cost  |
| ------------------------- | ------------- |
| Hosting (AWS/GCP)         | $150.00       |
| Database (Supabase Team)  | $599.00       |
| Domain/SSL                | $1.00         |
| Monitoring/Logging        | $50.00        |
| Support staff (part-time) | $500.00       |
| **Total**                 | **$1,300.00** |

#### Profit Summary - 5000 Users

| Metric            | Amount        |
| ----------------- | ------------- |
| Revenue           | $9,975.00     |
| API Costs         | $3,070.00     |
| Infrastructure    | $1,300.00     |
| **Total Costs**   | **$4,370.00** |
| **Net Profit**    | **$5,605.00** |
| **Profit Margin** | **56.2%**     |

---

## Profitability Summary

### Comparison Across Scenarios

| Metric              | 50 Users | 500 Users | 5000 Users |
| ------------------- | -------- | --------- | ---------- |
| **Monthly Revenue** | $69.85   | $848.00   | $9,975.00  |
| **API Costs**       | $24.70   | $277.00   | $3,070.00  |
| **Infrastructure**  | $13.00   | $61.00    | $1,300.00  |
| **Total Costs**     | $37.70   | $338.00   | $4,370.00  |
| **Net Profit**      | $32.15   | $510.00   | $5,605.00  |
| **Profit Margin**   | 46.0%    | 60.1%     | 56.2%      |
| **Revenue/User**    | $1.40    | $1.70     | $2.00      |
| **Cost/User**       | $0.75    | $0.68     | $0.87      |
| **Profit/User**     | $0.64    | $1.02     | $1.12      |

### Annual Projections

| Metric             | 50 Users | 500 Users | 5000 Users |
| ------------------ | -------- | --------- | ---------- |
| **Annual Revenue** | $838     | $10,176   | $119,700   |
| **Annual Costs**   | $452     | $4,056    | $52,440    |
| **Annual Profit**  | $386     | $6,120    | $67,260    |

### Key Insights

1. **Break-even Point**: ~25 paying users cover infrastructure costs
2. **Optimal Mix**: Higher Basic tier adoption improves margins
3. **Free Tier Strategy**: Each free user costs $0.20/month but aids conversion
4. **Scale Benefits**: Profit margin improves with scale due to fixed costs

### Cost Optimization Strategies

1. **Use Groq over OpenAI Whisper** - 10x cheaper for audio
2. **Batch API for non-urgent tasks** - 50% discount on Claude
3. **Implement response caching** - Reduce duplicate API calls
4. **Limit free tier usage** - Prevents abuse while maintaining funnel

---

## Sources

- [Claude API Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [Groq Pricing](https://groq.com/pricing)
- [OpenAI Whisper Pricing](https://openai.com/api/pricing/)
- [WhatsApp Business API Pricing](https://business.whatsapp.com/products/platform-pricing)

---

_This analysis is based on current API pricing as of February 2026 and typical usage patterns. Actual costs may vary based on user behavior and API pricing changes._
