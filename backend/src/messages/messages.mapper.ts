import type { Prisma } from '@prisma/client';

export const MESSAGE_INCLUDE = {
  author: { select: { id: true, displayName: true } },
  voiceFile: { select: { id: true, durationSeconds: true } },
  attachments: {
    select: { id: true, kind: true, mimeType: true, originalName: true, sizeBytes: true },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.MessageInclude;

export type MessageWithRelations = Prisma.MessageGetPayload<{ include: typeof MESSAGE_INCLUDE }>;

export function toMessageResponse(message: MessageWithRelations) {
  return {
    id: message.id,
    kind: message.kind,
    author: message.author,
    text: message.text,
    voice: message.voiceFile
      ? { fileId: message.voiceFile.id, durationSeconds: Number(message.voiceFile.durationSeconds) }
      : null,
    attachments: message.attachments.map((a) => ({
      fileId: a.id,
      kind: a.kind,
      mimeType: a.mimeType,
      originalName: a.originalName,
      sizeBytes: a.sizeBytes,
    })),
    createdAt: message.createdAt,
  };
}

export type MessageResponse = ReturnType<typeof toMessageResponse>;
