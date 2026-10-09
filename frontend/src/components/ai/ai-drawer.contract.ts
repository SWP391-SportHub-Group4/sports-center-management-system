export interface AiDrawerAdapter<
  TContext,
  TResult,
  TDraft
> {
  id: string;

  generate(
    context: TContext,
    signal: AbortSignal,
  ): Promise<TResult>;

  toDraft(
    result: TResult,
  ): TDraft;
}