import { Injectable, OnModuleInit } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/** Argon2id with the library defaults (19 MiB memory, 2 passes), per OWASP guidance (spec 11.1). */
@Injectable()
export class PasswordService implements OnModuleInit {
    private dummyHash = '';

    async onModuleInit(): Promise<void> {
        // Used to spend the same time on unknown accounts as on real ones (no user enumeration by timing).
        this.dummyHash = await hash('not-a-real-password-placeholder');
    }

    hash(password: string): Promise<string> {
        return hash(password);
    }

    async verify(passwordHash: string | null | undefined, password: string): Promise<boolean> {
        try {
            return await verify(passwordHash || this.dummyHash, password) && !!passwordHash;
        } catch {
            return false;
        }
    }
}
