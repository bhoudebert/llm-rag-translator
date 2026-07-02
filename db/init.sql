-- Runs once on first container init. The application also issues
-- `CREATE EXTENSION IF NOT EXISTS vector` and creates the `tm` table itself,
-- so this file is just a belt-and-suspenders guarantee the extension exists.
CREATE EXTENSION IF NOT EXISTS vector;
