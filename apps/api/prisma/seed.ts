import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const workspace = await prisma.workspace.upsert({
    where: { slug: "demo" },
    update: {},
    create: {
      id: "demo-workspace",
      name: "Demo Workspace",
      slug: "demo",
      plan: "PRO",
    },
  });

  const user = await prisma.user.upsert({
    where: { email: "supporter@example.com" },
    update: {},
    create: {
      email: "supporter@example.com",
      name: "Demo Agent",
    },
  });

  await prisma.workspaceMember.upsert({
    where: { userId_workspaceId: { userId: user.id, workspaceId: workspace.id } },
    update: {},
    create: {
      userId: user.id,
      workspaceId: workspace.id,
      role: "OWNER",
    },
  });

  const file = await prisma.file.upsert({
    where: { objectKey: "demo/return-policy.pdf" },
    update: {},
    create: {
      workspaceId: workspace.id,
      uploaderId: user.id,
      bucket: "demo-bucket",
      objectKey: "demo/return-policy.pdf",
      size: 2048,
      mimeType: "application/pdf",
      status: "READY",
    },
  });

  const document = await prisma.document.upsert({
    where: { id: "demo-doc-return-policy" },
    update: {},
    create: {
      id: "demo-doc-return-policy",
      workspaceId: workspace.id,
      sourceFileId: file.id,
      title: "Return policy v2",
      status: "READY",
      tokens: 1200,
    },
  });

  await prisma.chatSession.upsert({
    where: { id: "demo-session" },
    update: {},
    create: {
      id: "demo-session",
      workspaceId: workspace.id,
      userId: user.id,
      documentId: document.id,
      title: "Return policy questions",
      messages: {
        createMany: {
          data: [
            {
              role: "user",
              content: "How long do customers have to return a headset?",
            },
            {
              role: "assistant",
              content: "Customers have 30 days from delivery to return headsets in original packaging.",
              metadata: { citations: [document.id] },
            },
          ],
        },
      },
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
