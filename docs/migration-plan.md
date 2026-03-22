# План миграции

## Этап 1 — Сохранить текущую систему

- legacy Wix код оставить в `legacy/wix/`
- Apps Script оставить в `integrations/google-apps-script/`
- завести новый frontend/backend каркас

## Этап 2 — Новый backend

Вынести:
- Kenjo client
- Excel parser
- TimeChecks service
- Calendar upload service
- Payroll API client

## Этап 3 — Новый frontend

Переписывать страницы по одной:
- Employees
- Employee Profile
- Payroll
- Calendar
- Kenjo Sync

## Этап 4 — Очистка дублей

В Apps Script есть дубли функций. Их нужно убрать после того, как логика будет перенесена в отдельные модули.

## Этап 5 — Решение по расчетному ядру

Вариант A: оставить Apps Script как payroll engine.

Вариант B: перенести payroll-логику в Node/PostgreSQL.
