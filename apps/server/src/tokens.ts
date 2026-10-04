/** Injection tokens: kernel services are plain objects, wired by NestJS at the edge (ADR-0054). */
export const CONFIG = Symbol("CONFIG");
export const APP_DB = Symbol("APP_DB");
export const IDENTITY = Symbol("IDENTITY");
export const AUTHZ = Symbol("AUTHZ");
export const EVENTS = Symbol("EVENTS");
export const DOCUMENTS = Symbol("DOCUMENTS");
export const FILES = Symbol("FILES");
export const CATALOG = Symbol("CATALOG");
