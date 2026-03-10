"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function TriviaCard() {
  const triviaState = useQuery(api.trivia.getTriviaState);
  const submitTrivia = useMutation(api.trivia.submitTrivia);
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<{
    success: boolean;
    points: number;
    correctCount?: number;
    totalQuestions?: number;
    message?: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (triviaState === undefined) return null;
  const { canPlay, questions, todayCompleted, todayPoints } = triviaState;

  const handleSubmit = async () => {
    if (answers.length !== questions.length) return;
    setSubmitting(true);
    setResult(null);
    try {
      const r = await submitTrivia({ answers });
      setResult(r);
    } catch (e) {
      setResult({
        success: false,
        points: 0,
        message: e instanceof Error ? e.message : "Something went wrong",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const setAnswer = (index: number, value: number) => {
    setAnswers((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const allAnswered =
    questions.length > 0 &&
    questions.every((_, i) => typeof answers[i] === "number" && answers[i] >= 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-xl text-brand-text">
          Cake Trivia — Earn Points
        </CardTitle>
        <CardDescription>
          Answer 3 cake questions correctly. 10 points per correct answer. One play per day.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!canPlay ? (
          <p className="text-sm text-muted-foreground">
            Log in to play trivia and earn loyalty points.
          </p>
        ) : todayCompleted ? (
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-4 text-emerald-800 dark:text-emerald-200">
            <p className="font-medium">You earned {todayPoints} points today!</p>
            <p className="text-sm mt-1">Come back tomorrow for a new round.</p>
          </div>
        ) : result?.success ? (
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-4 text-emerald-800 dark:text-emerald-200">
            <p className="font-medium">
              {result.correctCount}/{result.totalQuestions} correct — {result.points} points earned!
            </p>
          </div>
        ) : result ? (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 p-4 text-amber-800 dark:text-amber-200">
            <p>{result.message ?? `${result.points} points earned.`}</p>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {questions.map((q, qi) => (
                <div key={q.id} className="space-y-2">
                  <Label className="text-sm font-medium">{q.question}</Label>
                  <div className="flex flex-col gap-2">
                    {q.options.map((opt, oi) => (
                      <label
                        key={oi}
                        className={cn(
                          "flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                          answers[qi] === oi
                            ? "border-brand text-brand bg-brand/5"
                            : "hover:bg-muted/50"
                        )}
                      >
                        <input
                          type="radio"
                          name={`trivia-${qi}`}
                          checked={answers[qi] === oi}
                          onChange={() => setAnswer(qi, oi)}
                          className="h-4 w-4"
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <Button
              onClick={handleSubmit}
              disabled={!allAnswered || submitting}
              className="w-full"
            >
              {submitting ? "Submitting…" : "Submit & Earn Points"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
