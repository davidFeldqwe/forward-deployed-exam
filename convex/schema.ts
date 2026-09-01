import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  accounts: defineTable({
    email: v.string(),
    passwordHash: v.string(),
  }).index("by_email", ["email"]),
  threads: defineTable({
    threadId: v.string(),
    ownerEmail: v.string(),
    title: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    messages: v.array(v.any()),
  })
    .index("by_threadId", ["threadId"])
    .index("by_owner_updatedAt", ["ownerEmail", "updatedAt"]),
});
