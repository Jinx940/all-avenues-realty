import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, WorkerStatus } from '@prisma/client';
import 'dotenv/config';
import {
  defaultProperties,
  defaultPropertySpecifications,
  defaultWorkers,
} from '../src/data/defaults.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL ?? '',
  }),
});

async function main() {
  await Promise.all(
    defaultProperties.map(async (name) => {
      const existing = await prisma.property.findUnique({
        where: { name },
        select: { id: true },
      });

      if (existing) {
        return prisma.property.update({
          where: { id: existing.id },
          data: {
            address: name,
            ...defaultPropertySpecifications[name],
          },
        });
      }

      return prisma.property.create({
        data: {
          name,
          address: name,
          ...defaultPropertySpecifications[name],
        },
      });
    }),
  );

  await Promise.all(
    defaultWorkers.map((name) =>
      prisma.worker.upsert({
        where: { name },
        update: {
          status: WorkerStatus.ACTIVE,
        },
        create: {
          name,
          status: WorkerStatus.ACTIVE,
        },
      }),
    ),
  );
  console.log(
    `Seed completed with ${defaultProperties.length} properties and ${defaultWorkers.length} workers.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
