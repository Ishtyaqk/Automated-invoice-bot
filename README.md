# 🧾 Receipt Organizer — Full Stack Setup Guide

> **Stack:** Telegram → n8n → Gemini Vision → Firebase → React Dashboard (Vercel)  
> **Cost:** $0 (all free tiers, nothing pauses or expires)

---

## Project Overview

This project captures receipt photos via Telegram, extracts data using Google Gemini Vision AI, stores images in Firebase Storage and metadata in Firestore, and displays everything in a React dashboard deployed on Vercel.

### Architecture

```
[You] → Telegram (send photo/PDF)
           ↓
        n8n (orchestration)
           ↓
    Gemini Vision API (extract: vendor, date, amount, category)
           ↓
    ┌──────────────────────────┐
    │  Firebase Storage        │  ← receipt image file
    │  Firestore (DB)          │  ← metadata row
    └──────────────────────────┘
           ↓
    React Dashboard (Vercel)   ← view, filter, search receipts
```

---

## Why These Tools

| Tool | Why |
|------|-----|
| **Telegram** | Free bot API, no approval needed, instant setup, supports image/PDF upload natively |
| **Gemini** | Free via AI Studio, has vision (image reading) capability — Groq does not |
| **Firebase** | Free Spark plan, never pauses (Supabase pauses after 7 days inactivity) |
| **n8n (self-hosted)** | Free, open source, has native Gemini + Telegram nodes |
| **Vercel** | Free frontend hosting, perfect for React dashboards |

---

## Prerequisites

- [ ] Self-hosted n8n instance (Railway, Render, or local)
- [ ] Google account (for Gemini API + Firebase)
- [ ] Telegram account
- [ ] Node.js + npm (for local dashboard development)
- [ ] Vercel account (free)

---

## Part 1 — Firebase Setup

### 1.1 Create Firebase Project

1. Go to [firebase.google.com](https://firebase.google.com) → **Add Project**
2. Name it `receipt-organizer` → Continue
3. Disable Google Analytics (not needed) → Create Project

### 1.2 Enable Firestore

1. In Firebase Console → **Firestore Database** → Create Database
2. Choose **Start in test mode** (you'll secure it later)
3. Select a region close to you (e.g., `asia-south1` for India)

Firestore will store each receipt as a document with these fields:

```
receipts (collection)
  └── {auto-id} (document)
        ├── vendor: "Swiggy"
        ├── date: "2025-06-15"
        ├── amount: 450
        ├── currency: "INR"
        ├── category: "Eating Out"
        ├── imageUrl: "https://firebasestorage..."
        ├── fileName: "2025-06-15_Swiggy_450_INR.jpg"
        └── createdAt: timestamp
```

### 1.3 Enable Firebase Storage

1. In Firebase Console → **Storage** → Get Started
2. Start in test mode → Choose same region as Firestore

### 1.4 Get Firebase Config (for Dashboard)

1. Firebase Console → Project Settings (gear icon) → **General**
2. Scroll to **Your apps** → Add app → Web (`</>`)
3. Register app as `receipt-dashboard`
4. Copy the `firebaseConfig` object — you'll need this for the React dashboard

```javascript
// Save this, you'll paste it into the dashboard later
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "receipt-organizer.firebaseapp.com",
  projectId: "receipt-organizer",
  storageBucket: "receipt-organizer.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

### 1.5 Get Firebase Admin SDK (for n8n)

n8n will write to Firebase using the REST API, authenticated with a service account.

1. Firebase Console → Project Settings → **Service Accounts**
2. Click **Generate new private key** → Download JSON
3. Open the JSON and note these values:
   - `project_id`
   - `client_email`
   - `private_key`

> ⚠️ Keep this file secure. Never commit it to GitHub.

---

## Part 2 — Telegram Bot Setup

1. Open Telegram → Search `@BotFather`
2. Send `/newbot`
3. Follow prompts — name your bot (e.g., `My Receipt Bot`)
4. Copy the **API Token** (looks like `7123456789:AAHxxx...`)
5. Start a chat with your new bot and send any message
6. Get your **Chat ID**: visit `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` in browser → find `"chat":{"id":XXXXXXXX}` — copy that number

---

## Part 3 — Gemini API Setup

1. Go to [aistudio.google.com](https://aistudio.google.com)
2. Click **Get API Key** → Create API Key
3. Copy the key (starts with `AIza...`)

> This is free with generous limits. No billing required.

---

## Part 4 — n8n Workflow Setup

### 4.1 Import the Workflow

1. Open your n8n instance
2. **Workflows** → **Import from File**
3. Select `receipt_organizer_ai.json` (the original file)

### 4.2 Connect Telegram Credential

1. Open **Telegram Trigger** node → Create new credential
2. Paste your Bot API Token → Save
3. Do the same for **Get File** and **Send Confirmation** nodes (same credential)

### 4.3 Connect Gemini Credential

1. Open **Analyze an image** node → Create new credential
2. Select **Google Gemini (PaLM) API**
3. Paste your Gemini API Key → Save
4. Do the same for **Analyze a file** node

### 4.4 Replace Google Drive with Firebase

The original workflow saves to Google Drive. Replace the **Backup to Drive** node with two **HTTP Request** nodes:

---

#### Node A — Upload Image to Firebase Storage

Replace **Backup to Drive** with an HTTP Request node:

- **Name:** `Upload to Firebase Storage`
- **Method:** `POST`
- **URL:**
  ```
  https://firebasestorage.googleapis.com/v0/b/YOUR_PROJECT_ID.appspot.com/o?uploadType=media&name=receipts%2F{{ $('Format Data').first().json.newFileName }}
  ```
- **Authentication:** None (using query param token) — OR use Bearer token from service account (see note below)
- **Body:** Binary data — select the binary key from `Get File`
- **Headers:**
  - `Content-Type`: `{{ $('Get File').first().binary.data.mimeType }}`

> **Firebase Auth for n8n:** The simplest approach for a personal tool is to temporarily set Firebase Storage rules to allow writes, then lock them down after setup. Alternatively, generate a Firebase auth token using a small helper Cloud Function or use the Firebase REST API with an API key appended: `&key=YOUR_WEB_API_KEY`.

---

#### Node B — Save Metadata to Firestore

Add another HTTP Request node after the Storage upload:

- **Name:** `Save to Firestore`
- **Method:** `POST`
- **URL:**
  ```
  https://firestore.googleapis.com/v1/projects/YOUR_PROJECT_ID/databases/(default)/documents/receipts
  ```
- **Authentication:** None (test mode) or OAuth2
- **Body Type:** JSON
- **Body:**

```json
{
  "fields": {
    "vendor": { "stringValue": "={{ $('Format Data').first().json.vendor }}" },
    "date": { "stringValue": "={{ $('Format Data').first().json.date }}" },
    "amount": { "doubleValue": "={{ $('Format Data').first().json.amount }}" },
    "currency": { "stringValue": "={{ $('Format Data').first().json.currency }}" },
    "category": { "stringValue": "={{ $('Format Data').first().json.category }}" },
    "fileName": { "stringValue": "={{ $('Format Data').first().json.newFileName }}" },
    "imageUrl": { "stringValue": "={{ $json.downloadTokens ? 'https://firebasestorage.googleapis.com/v0/b/YOUR_PROJECT_ID.appspot.com/o/receipts%2F' + $('Format Data').first().json.newFileName + '?alt=media' : '' }}" },
    "createdAt": { "timestampValue": "={{ new Date().toISOString() }}" }
  }
}
```

### 4.5 Update the Format Data Node

Open the **Format Data** (Code) node. You can remove the `FOLDER_IDS` block entirely — it's no longer needed. Keep everything else as-is. The node outputs `vendor`, `date`, `amount`, `currency`, `category`, `newFileName` — all of which feed into Firebase.

### 4.6 Update the Send Confirmation Node

Update the Telegram confirmation message to remove the Drive link:

```
✅ Receipt saved!

💰 Amount: ${{ $('Format Data').first().json.amount }} {{ $('Format Data').first().json.currency }}
🏪 Vendor: {{ $('Format Data').first().json.vendor }}
📁 Category: {{ $('Format Data').first().json.category }}
📅 Date: {{ $('Format Data').first().json.date }}

📊 View your receipts: https://your-dashboard.vercel.app
```

### 4.7 Final Workflow Structure

```
Telegram Trigger
    → Get File
    → If (image or PDF?)
        → Analyze an image (Gemini)   ← if image
        → Analyze a file (Gemini)     ← if PDF
    → Format Data (Code node)
    → Upload to Firebase Storage
    → Save to Firestore
    → Send Confirmation (Telegram)
```

---

## Part 5 — React Dashboard

### 5.1 Project Setup

```bash
npm create vite@latest receipt-dashboard -- --template react
cd receipt-dashboard
npm install
npm install firebase
```

### 5.2 Firebase Config

Create `src/firebase.js`:

```javascript
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  // Paste your config from Part 1.4 here
  apiKey: "YOUR_API_KEY",
  authDomain: "receipt-organizer.firebaseapp.com",
  projectId: "receipt-organizer",
  storageBucket: "receipt-organizer.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
```

### 5.3 Dashboard Features to Build

The dashboard should have:

- **Receipt table** — sortable by date, vendor, amount, category
- **Category filter** — dropdown to filter by Eating Out, Groceries, etc.
- **Month filter** — view receipts by month
- **Summary cards** — total spend, spend by category, count of receipts
- **Image preview** — click a receipt row to see the original image
- **Search** — search by vendor name

### 5.4 Main App Component (starter)

Replace `src/App.jsx` with:

```jsx
import { useEffect, useState } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from './firebase';

const CATEGORIES = ['All', 'Eating Out', 'Groceries', 'Utilities', 'Transport', 
                    'Shopping', 'Subscriptions', 'Tech & Office', 'Medical', 'Miscellaneous'];

export default function App() {
  const [receipts, setReceipts] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const fetchReceipts = async () => {
      const q = query(collection(db, 'receipts'), orderBy('date', 'desc'));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setReceipts(data);
      setFiltered(data);
    };
    fetchReceipts();
  }, []);

  useEffect(() => {
    let result = receipts;
    if (category !== 'All') result = result.filter(r => r.category === category);
    if (search) result = result.filter(r => r.vendor?.toLowerCase().includes(search.toLowerCase()));
    setFiltered(result);
  }, [category, search, receipts]);

  const total = filtered.reduce((sum, r) => sum + (r.amount || 0), 0);

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '1000px', margin: '0 auto' }}>
      <h1>🧾 Receipt Dashboard</h1>
      
      {/* Summary */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ padding: '1rem', background: '#f0f4ff', borderRadius: '8px', flex: 1 }}>
          <div style={{ fontSize: '0.8rem', color: '#666' }}>Total Receipts</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{filtered.length}</div>
        </div>
        <div style={{ padding: '1rem', background: '#f0fff4', borderRadius: '8px', flex: 1 }}>
          <div style={{ fontSize: '0.8rem', color: '#666' }}>Total Spend</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>₹{total.toFixed(2)}</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <input
          placeholder="Search vendor..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd', flex: 1 }}
        />
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
        >
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>

      {/* Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
            <th style={{ padding: '0.5rem' }}>Date</th>
            <th style={{ padding: '0.5rem' }}>Vendor</th>
            <th style={{ padding: '0.5rem' }}>Amount</th>
            <th style={{ padding: '0.5rem' }}>Category</th>
            <th style={{ padding: '0.5rem' }}>Receipt</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(r => (
            <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '0.5rem' }}>{r.date}</td>
              <td style={{ padding: '0.5rem' }}>{r.vendor}</td>
              <td style={{ padding: '0.5rem' }}>{r.amount} {r.currency}</td>
              <td style={{ padding: '0.5rem' }}>{r.category}</td>
              <td style={{ padding: '0.5rem' }}>
                {r.imageUrl && (
                  <a href={r.imageUrl} target="_blank" rel="noopener noreferrer">View</a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

> This is a functional starter. Style it as you prefer — or ask Claude to build a polished version once the data flow is working.

---

## Part 6 — Deploy Dashboard to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Build the project
npm run build

# Deploy
vercel
```

Follow the prompts. Your dashboard will be live at `https://receipt-dashboard-xxx.vercel.app`.

**Set environment variables in Vercel:**

Go to Vercel Dashboard → Your Project → Settings → Environment Variables. Add each value from your `firebaseConfig`:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Then update `src/firebase.js` to use:
```javascript
apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
// etc.
```

---

## Part 7 — Firebase Security Rules (Before Going Live)

Once you've confirmed everything works in test mode, lock down Firebase:

**Firestore rules** (Firebase Console → Firestore → Rules):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /receipts/{document} {
      allow read, write: if request.auth != null;
    }
  }
}
```

**Storage rules:**

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /receipts/{fileName} {
      allow read, write: if request.auth != null;
    }
  }
}
```

> For a personal tool, you can keep test mode rules initially. Add Firebase Authentication to the dashboard later if needed.

---

## Folder Structure (Dashboard)

```
receipt-dashboard/
├── src/
│   ├── firebase.js       ← Firebase config + exports
│   ├── App.jsx           ← Main dashboard component
│   ├── main.jsx          ← Entry point
│   └── index.css         ← Global styles
├── .env.local            ← Firebase env vars (never commit this)
├── .gitignore            ← Must include .env.local
├── package.json
└── vite.config.js
```

---

## Testing the Full Flow

1. Start n8n workflow (toggle Active on)
2. Send a receipt photo to your Telegram bot
3. Wait ~5–10 seconds for the confirmation message
4. Open your Vercel dashboard URL
5. Refresh — the receipt should appear in the table

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| n8n Gemini node errors | Check API key is correct in credentials |
| Firebase Storage upload fails | Confirm rules are in test mode, check MIME type header |
| Firestore document not appearing | Check n8n HTTP Request body format — Firestore REST API requires the typed field format `{ "stringValue": "..." }` |
| Dashboard shows no data | Check `firebase.js` config values match your project |
| Telegram bot not responding | Ensure n8n workflow is set to Active |

---

## Future Improvements (Phase 2)

- Add **Firebase Authentication** so only you can access the dashboard
- Add **monthly spend chart** using Recharts
- Add **export to CSV** button
- Add **WhatsApp input** via Meta Cloud API (same n8n flow, swap Telegram trigger)
- **Productize it** — add multi-user support and turn into a SaaS

---

*Built with Telegram · Google Gemini · n8n · Firebase · React · Vercel*
