# SetupFX India - Trading Platform

## Project Overview
SetupFX is an Indian trading platform with admin/user dashboards, real-time market data, and multi-segment trading (hedging, netting, binary).

## Architecture
- **Monorepo**: `client/` (React SPA) + `server/` (Node.js/Express API) + `setup.io.website/` (marketing site)
- **Database**: MongoDB via Mongoose
- **Real-time**: Socket.IO for live prices and trade updates
- **Market data**: MetaAPI, Zerodha, TrueData, Yahoo Finance (fallback)
- **Cache/Pub-sub**: Redis + ioredis

## Client (`client/`)
- **Framework**: React 19 + Vite
- **Routing**: react-router-dom v7
- **State**: Zustand (single store at `src/store/useStore.js`)
- **Styling**: Tailwind CSS 3 + custom CSS (themes in `src/styles/themes.css`)
- **Icons**: lucide-react (primary), react-icons (legacy)
- **Charts**: Lightweight Charts, AMCharts 5, TradingView charting_library
- **Module type**: ESM (`"type": "module"`)

### Client structure
```
src/
  pages/       # Admin/, User/, Auth/, Broker/, Landing/, Legal/, SubAdmin/
  components/  # Shared components
  hooks/       # Custom hooks (useMetaApiPrices, useZerodhaTicks, etc.)
  store/       # Zustand store
  services/    # API service layer
  utils/       # Helpers (brokerSymbolUtils, sounds, etc.)
  styles/      # Global CSS, themes
  constants/   # App constants
```

## Server (`server/`)
- **Runtime**: Node.js with Express 5
- **Module type**: CommonJS (`require`/`module.exports`)
- **Auth**: JWT (jsonwebtoken) + bcryptjs
- **Security**: helmet, express-rate-limit, hpp, express-mongo-sanitize, xss-clean
- **Email**: nodemailer + custom templates
- **Dev command**: `npm run dev` (uses `node --watch`)

### Server structure
```
config/      # Database connection, etc.
models/      # Mongoose schemas (48+ models)
routes/      # Express route handlers
services/    # Business logic services
engines/     # Trading engines
cron/        # Scheduled jobs
scripts/     # Utility scripts
tests/       # Unit tests
utils/       # Helpers
data/        # Runtime data (gitignored)
```

## Key Commands
```bash
# Client
cd client && npm run dev      # Start dev server
cd client && npm run build    # Production build
cd client && npm run lint     # ESLint

# Server
cd server && npm run dev      # Start with --watch
cd server && npm start        # Production start
cd server && npm test         # Run unit tests
```

## Conventions
- Client uses JSX (not TSX) - no TypeScript
- Server uses CommonJS (`require`), client uses ESM (`import`)
- Zustand for all client state management
- Mongoose models use PascalCase filenames
- Services use `camelCase.service.js` naming
- Icons: prefer `lucide-react` for new code
- CSS: Tailwind utility classes + custom theme CSS variables