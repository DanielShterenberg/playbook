# Basketball Playbook App

A web-based basketball playbook application that allows coaches to diagram plays, animate transitions between scenes, and share the entire playbook with their team.

## Features

- Interactive court editor with standard basketball diagramming symbols
- Multi-scene play creation with animated transitions
- Shared team playbook accessible to all members
- Role-based permissions (admin, editor, viewer)
- GIF export and share links for plays
- Firebase authentication and real-time sync

## Tech Stack

- **Frontend**: Next.js 14+ (App Router), React, TypeScript
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **Backend**: Firebase (Firestore, Authentication, Storage)
- **Deployment**: Vercel
- **Canvas**: HTML5 Canvas for court rendering and animations

## Getting Started

### Prerequisites

- Node.js 20+ and npm
- Firebase project (see Firebase setup below)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/DanielShterenberg/playbook.git
cd playbook
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```
Then fill in your Firebase configuration values in `.env.local`.

4. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting

## Project Structure

```
basketball-playbook/
├── src/
│   ├── app/                    # Next.js app router
│   │   ├── page.tsx            # Landing / auth
│   │   ├── playbook/           # Playbook grid view
│   │   ├── play/[id]/          # Play editor
│   │   └── team/               # Team settings
│   ├── components/
│   │   ├── court/              # Court canvas, rendering
│   │   ├── editor/             # Tools panel, scene strip
│   │   ├── players/            # Player components
│   │   ├── annotations/        # Drawing tools & symbols
│   │   ├── playback/           # Animation controls
│   │   └── playbook/           # Grid, filters, search
│   ├── lib/
│   │   ├── firebase.ts         # Firebase config & helpers
│   │   ├── store.ts            # Zustand store
│   │   ├── types.ts            # TypeScript interfaces
│   │   ├── animation.ts        # Interpolation & playback engine
│   │   └── export.ts           # GIF/video/PDF export
│   └── hooks/                  # Custom React hooks
├── public/                     # Static assets
└── ...config files
```

## Firebase Setup

1. Create a new Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable Firestore Database
3. Enable Authentication (Email/Password and Google Sign-In)
4. Create a Storage bucket
5. Copy your Firebase config to `.env.local`

## Contributing

This project follows trunk-based development:
- Create feature branches from `master`
- Always rebase before merging
- Use squash-and-merge for PRs
- No merge commits

## License

MIT License - see LICENSE file for details

## Documentation

For full product requirements and feature details, see [playbook-prd.md](./playbook-prd.md).
