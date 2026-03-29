import { UserRole, UserStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { ensureDefaultAdminUser } from '../lib/auth.js';

const readArg = (flag: string) => {
  const directPrefix = `${flag}=`;
  const directMatch = process.argv.find((arg) => arg.startsWith(directPrefix));
  if (directMatch) {
    return directMatch.slice(directPrefix.length).trim();
  }

  const flagIndex = process.argv.findIndex((arg) => arg === flag);
  if (flagIndex >= 0) {
    return String(process.argv[flagIndex + 1] ?? '').trim();
  }

  return '';
};

const username = readArg('--username');
const password = readArg('--password');
const displayName = readArg('--display-name') || 'System Administrator';

if (!username || !password) {
  console.error(
    'Usage: npm run admin:bootstrap -- --username <username> --password <password> [--display-name "Name"]',
  );
  process.exit(1);
}

try {
  const result = await ensureDefaultAdminUser(prisma, {
    username,
    password,
    displayName,
    activeStatus: UserStatus.ACTIVE,
    adminRole: UserRole.ADMIN,
  });

  console.log(`Admin account is ready. User id: ${result.id}`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
