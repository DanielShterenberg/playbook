# Sprint Orchestrator Memory

## Project: Basketball Playbook

### Current Sprint Status
- **Active Milestone**: M0: Project Foundation
- **Sprint Start**: 2026-02-18
- **Repository**: DanielShterenberg/playbook
- **Current State**: Empty repository (no Next.js project yet)

### M0: Project Foundation - P0 Issues
1. **Issue #44**: Initialize Next.js project with base tooling (NO DEPENDENCIES)
2. **Issue #45**: Set up Firebase project and configuration (DEPENDS ON #44)
3. **Issue #46**: Set up Vercel deployment (DEPENDS ON #44, #45)
4. **Issue #47**: Define TypeScript types and interfaces (DEPENDS ON #44)
5. **Issue #48**: Set up Zustand store with initial state (DEPENDS ON #47)

### Issue Dependencies (Critical Path)
```
#44 (Next.js Init)
├─> #45 (Firebase)
├─> #47 (Types)
│   └─> #48 (Zustand)
└─> #46 (Vercel) [requires #44 + #45]
```

### Optimal Execution Order
1. #44 - Must be done first (blocks everything)
2. #47 - Can start immediately after #44
3. #45 - Can start immediately after #44 (parallel with #47)
4. #48 - Depends on #47
5. #46 - Depends on #44 and #45 (final integration)

### Git Workflow
- Trunk-based development (main branch: `master`)
- Always rebase before merging
- Use squash-and-merge for PRs
- Force push is acceptable during rebase

### Agent Delegation Notes
- Start with #44 as it's the foundation blocker
- Can parallelize #47 and #45 once #44 is complete
- Keep issues focused and atomic
- Each issue should result in a single PR

## Future Milestones (Reference)
- M1: Court & Players (issues #49-55)
- M2: Drawing Tools (issues #56-62)
- M3: Scenes & Animation (issues #63-66)
- M4: Play Management (issues #67-72)
- M5: Auth & Teams (issues #73-76)
- M6: Export & Sharing (issues #77-80)
- M7: Polish & Launch (issues #81-85)
