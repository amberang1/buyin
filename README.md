# Buy In - Poker Ledger & Chip Scanner

A real-time poker table ledger, buy-in manager, and AI chip scanner built with React, Vite, Tailwind CSS, and Firebase Firestore.

## Features
- **Table Stakes & Chip Configurations**: Customize chip values or scan starting stacks with Gemini AI.
- **Bulk & Individual Buy-in Management**: Track table stakes with optional upfront buy-ins and validation.
- **Active Game Live Reconciliation**: Track re-buys and mid-game cash-outs with instant pot calculations.
- **End-of-Game Settlement**: Input chip stacks manually or scan them with AI to calculate net winnings/losses and final debts.
- **Persistent Sessions**: Sessions persist locally and sync across participants via Firebase Firestore.

## Setup & Running Locally

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Run dev server**:
   ```bash
   npm run dev
   ```

3. **Build for production**:
   ```bash
   npm run build
   ```
