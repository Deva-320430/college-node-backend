import { prisma } from '../lib/prisma';

export const createAuditLog = async ({
  userId,
  userRole,
  action,
  entity,
  entityId,
  previousValue,
  newValue,
  ipAddress,
}: {
  userId?: string;
  userRole?: string;
  action: string;
  entity: string;
  entityId?: string;
  previousValue?: string;
  newValue?: string;
  ipAddress?: string;
}) => {
  await prisma.auditLog.create({
    data: {
      userId,
      userRole,
      action,
      entity,
      entityId,
      previousValue,
      newValue,
      ipAddress,
    },
  });
};
