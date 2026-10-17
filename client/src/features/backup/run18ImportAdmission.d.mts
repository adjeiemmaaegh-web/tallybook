export function run18ImportMemoryLimit(deviceMemoryGiB?:number):number;
export function assertRun18ImportAdmission(size:number,deviceMemoryGiB?:number):true;
export function readRun18BoundedBackupFile(file:Pick<File,"size"|"text">,deviceMemoryGiB?:number):Promise<string>;
