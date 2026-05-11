import { z } from "zod";

export const transactionSchema = z.object({
  fundCode: z.string().trim().min(1, "Mã quỹ là bắt buộc."),
  amount: z.number().positive("Số tiền phải lớn hơn 0."),
  ccq: z.number().positive().optional(),
  date: z.string().optional(),
});

export const deleteTransactionSchema = z.object({
  id: z.number().int().positive("ID giao dịch không hợp lệ."),
});

export const transactionSellSchema = z.object({
  buyTransactionId: z.number().int().positive("ID giao dịch mua không hợp lệ."),
  sellDate: z.string().trim().min(1, "Ngày bán là bắt buộc."),
  sellTime: z
    .string()
    .trim()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Giờ bán phải theo định dạng HH:mm.")
    .optional(),
  ccq: z.number().positive("Số CCQ bán phải lớn hơn 0."),
  unitPrice: z.number().positive("Giá bán phải lớn hơn 0.").optional(),
  note: z.string().max(300).optional(),
});

export const watchlistSchema = z.object({
  trackedCodes: z.array(z.string()).optional(),
  monthlyContributionMap: z.record(z.string(), z.number()).optional(),
});

export const watchlistBoardSchema = z.object({
  mainCode: z.string().trim().optional(),
  quickCodes: z.array(z.string().trim()).max(6).optional(),
});

export const installTriggerSchema = z.object({
  updateIntervalMinutes: z.number().int().positive().max(1440).optional(),
  snapshotIntervalHours: z.number().int().positive().max(168).optional(),
});

export const projectionSchema = z.object({
  years: z.number().int().positive().max(50),
});

export const cronSchema = z.object({
  secret: z.string().min(1),
  task: z.enum(["realtime", "snapshot"]),
});
