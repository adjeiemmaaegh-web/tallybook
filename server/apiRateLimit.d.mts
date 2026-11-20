import type {RequestHandler} from 'express';
export function createApiRateLimit(options?:{limit?:number;windowMs?:number}):RequestHandler;
