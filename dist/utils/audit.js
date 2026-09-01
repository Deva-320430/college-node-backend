"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAuditLog = void 0;
const prisma_1 = require("../lib/prisma");
const createAuditLog = async ({ userId, userRole, action, entity, entityId, previousValue, newValue, ipAddress, }) => {
    await prisma_1.prisma.auditLog.create({
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
exports.createAuditLog = createAuditLog;
