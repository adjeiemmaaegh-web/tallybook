import type { DBCore, Dexie } from "dexie";
import {
  protectWorkspaceTransaction,
  requireWorkspaceAccess,
} from "./workspaceBoundary";
/** Protect every Dexie transaction, including calls made outside React routes.
 * Migrations and raw browser storage are NOT an encryption boundary. */
export function installWorkspaceDatabaseBoundary(database: Dexie) {
  database.use({
    stack: "dbcore",
    name: "MissionGoWorkspaceAuthorization",
    level: 100,
    create(down: DBCore): DBCore {
      return {
        ...down,
        transaction(stores, mode, options) {
          requireWorkspaceAccess(database.name);
          const transaction = down.transaction(stores, mode, options);
          protectWorkspaceTransaction(transaction);
          return transaction;
        },
        table(name) {
          const table = down.table(name);
          const guard = () => requireWorkspaceAccess(database.name);
          return {
            ...table,
            get: request => {
              guard();
              return table.get(request);
            },
            getMany: request => {
              guard();
              return table.getMany(request);
            },
            query: request => {
              guard();
              return table.query(request);
            },
            count: request => {
              guard();
              return table.count(request);
            },
            openCursor: request => {
              guard();
              return table.openCursor(request);
            },
            mutate: request => {
              guard();
              return table.mutate(request);
            },
          };
        },
      };
    },
  });
}
