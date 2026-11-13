export type FreshStartStatus = 'not-requested' | 'already-complete' | 'cleared';
export function retirePriorBrowserData(options?: {
  epoch?: string;
  local?: Storage;
  session?: Storage;
  databaseFactory?: IDBFactory;
  cacheStore?: CacheStorage;
  workerContainer?: ServiceWorkerContainer;
  mandatoryOnlineAuth?: boolean;
}): Promise<FreshStartStatus>;
