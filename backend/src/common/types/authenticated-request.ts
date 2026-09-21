import { FastifyRequest } from 'fastify';
export type AuthUser = { id: string; phone?: string | null; email?: string | null; roles: string[]; permissions: string[] };
export interface AuthenticatedRequest extends FastifyRequest { user: AuthUser; }
