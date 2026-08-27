# 🚀 Guida Deploy Cloud — TRDGWDBOT

Questa guida ti spiega come mettere il bot online su **GitHub Pages** (frontend) + **Render** (backend) + **MongoDB Atlas** (database), senza mai tenere il PC acceso.

---

## 📋 Indice

1. [MongoDB Atlas (database)](#1-mongodb-atlas-database)
2. [Render (backend)](#2-render-backend)
3. [GitHub Pages (frontend)](#3-github-pages-frontend)
4. [Configura il bot la prima volta](#4-configura-il-bot-la-prima-volta)
5. [Aggiornare il codice](#5-aggiornare-il-codice)

---

## 1. MongoDB Atlas (database)

MongoDB Atlas è il database in cloud **gratuito**.

### Passo 1.1 — Registrati
1. Vai su https://www.mongodb.com/atlas
2. Clicca **"Try Free"** e registrati con email/Google
3. Scegli il piano **"M0 Sandbox"** (è gratis per sempre)
4. Seleziona il provider **AWS** e la regione più vicina a te (es. `Frankfurt`)
5. Clicca **"Create Deployment"**

### Passo 1.2 — Crea un utente
1. Nella schermata che appare, inserisci:
   - **Username**: `trdgwdbot`
   - **Password**: scegli una password sicura e **salvala**
2. Clicca **"Create Database User"**

### Passo 1.3 — Aggiungi l'IP del backend
1. Nella sezione **"Where would you like to connect from?"**
2. Clicca **"Add My Current IP Address"** (se stai configurando dal tuo PC)
3. Poi clicca anche **"Add IP Address"** e inserisci: `0.0.0.0/0` (permette a Render di connettersi)
4. Clicca **"Finish and Close"**

### Passo 1.4 — Ottieni l'URL di connessione
1. Dalla dashboard di Atlas, clicca **"Connect"** → **"Drivers"**
2. Seleziona **Python** e versione **4.0 or later**
3. Copia la stringa che inizia con `mongodb+srv://`
4. Sostituisci `<password>` con la password che hai scelto

Esempio:
```
mongodb+srv://trdgwdbot:la_tua_password@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
```

**Salva questa stringa**, ti serve per Render.

---

## 2. Render (backend)

Render ospita il backend Python **gratis**.

> ⚠️ **Attenzione**: il piano gratis di Render "dorme" dopo 15 minuti di inattività. Per un bot di trading 24/7 considera l'upgrade a $7/mese o usa Railway/Fly.io. Per ora procediamo con Render free.

### Passo 2.1 — Registrati
1. Vai su https://render.com
2. Registrati con GitHub (consigliato)

### Passo 2.2 — Crea il Web Service
1. Dalla dashboard Render, clicca **"New +"** → **"Web Service"**
2. Collega il tuo repository GitHub `TRDGWDBOT`
3. Configura così:
   - **Name**: `trdgwdbot-backend`
   - **Region**: `Frankfurt (EU Central)` (o la più vicina)
   - **Branch**: `main`
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn server:app --host 0.0.0.0 --port $PORT`
   - **Plan**: `Free`
4. Clicca **"Advanced"** e aggiungi le **Environment Variables**:

| Key | Value |
|-----|-------|
| `MONGO_URL` | La stringa di connessione MongoDB Atlas che hai copiato |
| `DB_NAME` | `trdgwdbot` |
| `DERIV_DEFAULT_APP_ID` | `1089` |
| `FERNET_KEY` | Genera con: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `API_SECRET` | Una password lunga e casuale (es. `mio-bot-2026-sicuro-987654321`) |
| `ALLOWED_ORIGINS` | Lascia vuoto per ora, lo aggiorneremo dopo |

5. Clicca **"Create Web Service"**

### Passo 2.3 — Ottieni l'URL del backend
1. Aspetta che il deploy finisca (vedi i log in tempo reale)
2. In alto vedrai un URL tipo: `https://trdgwdbot-backend.onrender.com`
3. **Copia questo URL**, ti serve per il frontend

---

## 3. GitHub Pages (frontend)

GitHub Pages ospita il frontend React **gratis**.

### Passo 3.1 — Configura il repository
1. Vai sul tuo repository GitHub `TRDGWDBOT`
2. Clicca **"Settings"** (in alto)
3. Nel menu a sinistra, clicca **"Pages"**
4. In **"Source"** seleziona **"GitHub Actions"**

### Passo 3.2 — Aggiungi i Secrets
1. Sempre in Settings, clicca **"Secrets and variables"** → **"Actions"**
2. Clicca **"New repository secret"** e aggiungi questi due:

| Name | Value |
|------|-------|
| `REACT_APP_API_URL` | L'URL del backend su Render (es. `https://trdgwdbot-backend.onrender.com`) |
| `REACT_APP_API_KEY` | La stessa password che hai messo in `API_SECRET` su Render |

### Passo 3.3 — Aggiorna il file package.json
1. Nel tuo repository, apri `frontend/package.json`
2. Trova la riga `"homepage"` e sostituisci `TUO-USERNAME` con il tuo username GitHub:
```json
"homepage": "https://mario-rossi.github.io/TRDGWDBOT"
```
3. Committa e pusha:
```bash
git add .
git commit -m "Aggiornato homepage per GitHub Pages"
git push
```

### Passo 3.4 — Il deploy automatico
1. Ogni volta che fai `git push` sul branch `main`, GitHub Actions:
   - Installa le dipendenze
   - Builda il frontend
   - Lo pubblica su GitHub Pages
2. Vai nella scheda **"Actions"** del tuo repository per vedere lo stato
3. Quando è verde ✅, il tuo frontend è live all'indirizzo:
   ```
   https://TUO-USERNAME.github.io/TRDGWDBOT
   ```

### Passo 3.5 — Aggiorna CORS sul backend
1. Torna su Render, vai nel tuo servizio `trdgwdbot-backend`
2. Clicca **"Environment"**
3. Modifica `ALLOWED_ORIGINS` inserendo l'URL del tuo frontend:
   ```
   https://TUO-USERNAME.github.io/TRDGWDBOT
   ```
4. Clicca **"Save Changes"** — Render si riavvierà automaticamente

---

## 4. Configura il bot la prima volta

1. Apri il browser all'indirizzo del tuo frontend:
   ```
   https://TUO-USERNAME.github.io/TRDGWDBOT
   ```
2. Vai nel tab **Config**
3. Inserisci il tuo **Token API Deriv** (vedi sotto come ottenerlo)
4. Lascia App ID = `1089`
5. Scegli `demo` per iniziare
6. Clicca **Salva & Connetti**

### Come ottenere il token Deriv
1. Vai su https://app.deriv.com/account/api-token
2. Accedi al tuo account Deriv
3. Clicca **"Create token"**
4. Dai un nome (es. "TRDGWDBOT")
5. Spunta **TUTTE** le caselle: Read, Trade, Trading information, Payments, Admin
6. Clicca **Create**
7. Copia il token (stringa lunga di lettere e numeri)

---

## 5. Aggiornare il codice

Quando vuoi modificare il codice:

```bash
# Modifica i file sul tuo PC
git add .
git commit -m "Descrizione della modifica"
git push origin main
```

Automaticamente:
- **Frontend**: GitHub Actions ridploya su GitHub Pages
- **Backend**: Render ridploya automaticamente (se hai collegato il repo)

---

## 🔧 Troubleshooting

| Problema | Causa | Soluzione |
|----------|-------|-----------|
| Frontend mostra "Errore stato" | Il backend è spento (Render free dorme) | Ricarica la pagina dopo 30 secondi, o fai upgrade a Render Starter ($7/mese) |
| Errore 401 / "Unauthorized" | Le password non coincidono | Controlla che `API_SECRET` (Render) = `REACT_APP_API_KEY` (GitHub Secrets) |
| Backend non si connette a MongoDB | IP non autorizzato | Su MongoDB Atlas, aggiungi `0.0.0.0/0` nella whitelist IP |
| Frontend non si carica | GitHub Pages non attivo | Vai in Settings → Pages → seleziona "GitHub Actions" |
| Il bot non apre ordini | Token Deriv scaduto | Rigenera il token su Deriv |

---

## 💰 Costi

| Servizio | Piano | Costo |
|----------|-------|-------|
| GitHub Pages | — | **Gratis** |
| Render | Free | **Gratis** (dorme dopo 15 min di inattività) |
| MongoDB Atlas | M0 Sandbox | **Gratis** (512 MB storage) |
| **Totale** | | **€0** |

Per un bot 24/7 senza interruzioni, considera Render Starter a **$7/mese**.
