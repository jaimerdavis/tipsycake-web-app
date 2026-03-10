import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser, getCurrentUserOrNull } from "./lib/auth";
import {
  TRIVIA_POINTS_PER_CORRECT,
} from "./lib/loyaltyConstants";

export const TRIVIA_QUESTIONS = [
  {
    id: "q1",
    question: "What type of cake does TheTipsyCake specialize in?",
    options: ["Cupcakes", "Bundt cakes", "Layer cakes", "Cheesecake"],
    correctIndex: 1,
  },
  {
    id: "q2",
    question: "Which ingredient is essential in most bundt cake recipes?",
    options: ["Coconut", "Butter", "Cottage cheese", "Breadcrumbs"],
    correctIndex: 1,
  },
  {
    id: "q3",
    question: "What makes a bundt cake have its distinctive shape?",
    options: ["A ring mold", "A loaf pan", "A sheet pan", "A muffin tin"],
    correctIndex: 0,
  },
] as const;

/** Get trivia questions and whether user can play today. */
export const getTriviaState = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserOrNull(ctx);
    if (!user) {
      return {
        canPlay: false,
        questions: TRIVIA_QUESTIONS,
        todayCompleted: false,
        todayPoints: 0,
      };
    }

    const today = new Date().toISOString().slice(0, 10);
    const todayCompletion = await ctx.db
      .query("triviaDailyCompletions")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", user._id).eq("completionDate", today)
      )
      .unique();

    return {
      canPlay: true,
      questions: TRIVIA_QUESTIONS,
      todayCompleted: todayCompletion !== null,
      todayPoints: todayCompletion?.pointsEarned ?? 0,
    };
  },
});

/** Submit trivia answers and award points if all correct. One play per day. */
export const submitTrivia = mutation({
  args: {
    answers: v.array(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    const today = new Date().toISOString().slice(0, 10);
    const existing = await ctx.db
      .query("triviaDailyCompletions")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", user._id).eq("completionDate", today)
      )
      .unique();

    if (existing) {
      return { success: false, points: 0, message: "Already played today" };
    }

    if (args.answers.length !== TRIVIA_QUESTIONS.length) {
      throw new Error("Invalid answers");
    }

    let correctCount = 0;
    for (let i = 0; i < TRIVIA_QUESTIONS.length; i++) {
      if (args.answers[i] === TRIVIA_QUESTIONS[i].correctIndex) {
        correctCount++;
      }
    }

    const pointsEarned = correctCount * TRIVIA_POINTS_PER_CORRECT;
    const now = Date.now();

    await ctx.db.insert("triviaDailyCompletions", {
      userId: user._id,
      completionDate: today,
      pointsEarned,
      createdAt: now,
    });

    if (pointsEarned > 0) {
      let account = await ctx.db
        .query("loyaltyAccounts")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .unique();

      if (!account) {
        const accountId = await ctx.db.insert("loyaltyAccounts", {
          userId: user._id,
          pointsBalance: 0,
          createdAt: now,
          updatedAt: now,
        });
        account = (await ctx.db.get(accountId))!;
      }

      await ctx.db.patch(account._id, {
        pointsBalance: account.pointsBalance + pointsEarned,
        updatedAt: now,
      });
      await ctx.db.insert("pointsLedger", {
        accountId: account._id,
        type: "earn",
        points: pointsEarned,
        note: "Trivia",
        createdAt: now,
      });
    }

    return {
      success: true,
      points: pointsEarned,
      correctCount,
      totalQuestions: TRIVIA_QUESTIONS.length,
    };
  },
});
