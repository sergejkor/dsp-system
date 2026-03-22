# DSP System Migration Workspace

Этот проект — готовый каркас для переноса текущей Wix + Apps Script системы в Cursor / VS Code.

## Что внутри

- `legacy/wix/` — текущий код Wix, разложенный по страницам, lightbox и backend
- `integrations/google-apps-script/` — текущий Apps Script payroll engine
- `frontend/` — заготовка нового фронтенда
- `backend/` — заготовка нового backend
- `docs/` — карта архитектуры и план миграции

## Рекомендуемый порядок работы

1. Открыть проект в Cursor / VS Code
2. Проверить legacy-код в `legacy/wix/`
3. Проверить Apps Script в `integrations/google-apps-script/`
4. Поднимать новый backend по модулям
5. Переписывать страницы Wix на React по одной

## Быстрый старт

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Backend

```bash
cd backend
npm install
npm run dev
```

## Важно

Этот каркас не ломает текущую систему. Он предназначен для безопасной миграции:

- сначала сохранить всё как есть,
- затем выносить модули по одному,
- потом заменить Wix frontend новым интерфейсом.
