-- Notifications push et préférences (spec 014) : abonnements push des appareils et préférences de
-- notification de chaque utilisateur. Migration additive : aucune donnée existante n'est modifiée, le
-- modèle Notification est inchangé. Retour arrière : down.sql.

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sessionId" VARCHAR(128),
    "endpoint" VARCHAR(2048) NOT NULL,
    "p256dh" VARCHAR(128) NOT NULL,
    "auth" VARCHAR(64) NOT NULL,
    "deviceLabel" VARCHAR(80) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSuccessAt" TIMESTAMPTZ(3),
    "lastUsedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "userId" UUID NOT NULL,
    "urgent" BOOLEAN NOT NULL DEFAULT true,
    "coverage" BOOLEAN NOT NULL DEFAULT true,
    "unfilled" BOOLEAN NOT NULL DEFAULT true,
    "attendance" BOOLEAN NOT NULL DEFAULT true,
    "urgentSound" BOOLEAN,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "PushSubscription_sessionId_idx" ON "PushSubscription"("sessionId");

-- CreateIndex
CREATE INDEX "PushSubscription_lastUsedAt_idx" ON "PushSubscription"("lastUsedAt");

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
