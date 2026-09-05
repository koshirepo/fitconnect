/**
 * Documentation: Create or edit one todo.
 *
 * - A page rather than a dialog, so a todo written from a deep link, a refresh, or the back button behaves like every other record in the app.
 * - A `todoId` in the route means edit and seeds the form from the record; without one it is a create.
 * - Visibility is admin-only. Coaches see the field disabled and locked to public, matching what the API will accept from them rather than letting them submit something it refuses.
 * - Split into a loader and a form on purpose: see the note above `TodoForm`.
 * - Primary exports: TodoFormPage.
 */
import * as React from "react";
import { Navigate, useParams } from "react-router-dom";
import { usePermissions } from "@/features/auth/permission-gate";
import { Permission } from "@fitconnect/shared/types/permissions";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { useAuthStore } from "@/stores/auth";
import { useCreateTodo, useTodo, useUpdateTodo } from "@/api/queries/catalog";
import { getApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormPageSkeleton } from "@/components/ui/skeleton";
import { AlertCircle, ArrowLeft } from "lucide-react";
import type { TodoVisibility } from "@/types/api";

type Todo = NonNullable<ReturnType<typeof useTodo>["data"]>["todo"];

export default function TodoFormPage() {
  const navigate = useAppNavigate();
  const { todoId } = useParams<{ todoId?: string }>();
  const isEdit = Boolean(todoId);
  const { can } = usePermissions();
  // Todo deletion is the narrower grant; visibility follows the same line.
  const isAdmin = can(Permission.TODOS_DELETE);
  const allowed = isEdit ? can(Permission.TODOS_UPDATE) : can(Permission.TODOS_CREATE);

  const todoQuery = useTodo(allowed ? todoId : undefined);
  const todo = todoQuery.data?.todo;

  if (!allowed) {
    return <Navigate to="/todos" replace />;
  }

  if (isEdit && todoQuery.isLoading) return <FormPageSkeleton fields={3} />;

  if (isEdit && todoQuery.isError) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-2" />
            <CardTitle>Todo not found</CardTitle>
            <CardDescription>{getApiError(todoQuery.error)}</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button variant="outline" onClick={() => navigate("/todos")}>
              <ArrowLeft className="h-4 w-4" />
              Back to Todos
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <TodoForm
      key={todo?.id ?? "new"}
      todoId={todoId}
      todo={todo}
      isEdit={isEdit}
      isAdmin={isAdmin}
    />
  );
}

/**
 * The form itself, mounted only once its record has loaded.
 *
 * The `key` is what replaces the old seed-once effect. This used to be one
 * component that started with empty fields and copied the loaded todo into
 * state from a `useEffect`, guarded by a `seeded` flag so a background refetch
 * could not wipe an edit in progress. That is a cascading render — empty form,
 * then a second pass with the real values — and the flag is a hand-rolled
 * version of what a key does for free.
 *
 * Keying on the record's id means React mounts a fresh form when the route
 * points at a different todo, and leaves this one alone for any other reason,
 * including a refetch that returns the same record.
 */
function TodoForm({
  todoId,
  todo,
  isEdit,
  isAdmin,
}: {
  todoId?: string;
  todo?: Todo;
  isEdit: boolean;
  isAdmin: boolean;
}) {
  const navigate = useAppNavigate();
  const { currentTenantId } = useAuthStore();

  const [title, setTitle] = React.useState(todo?.title ?? "");
  const [description, setDescription] = React.useState(todo?.description ?? "");
  const [visibility, setVisibility] = React.useState<TodoVisibility>(
    todo?.visibility ?? "PUBLIC",
  );
  const [error, setError] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const createTodo = useCreateTodo();
  const updateTodo = useUpdateTodo();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenantId) return;

    setError("");
    setSubmitting(true);

    // Which call to make is decided before the try, not inside it. React
    // Compiler bails out of a whole function when a branch or a logical
    // expression appears inside try/catch, so the block below holds only the
    // await and nothing else.
    const save =
      isEdit && todoId
        ? () =>
            updateTodo.mutateAsync({
              todoId,
              data: {
                title: title.trim(),
                description: description.trim() ? description.trim() : null,
                ...(isAdmin ? { visibility } : {}),
              },
            })
        : () =>
            createTodo.mutateAsync({
              title: title.trim(),
              description: description.trim() || undefined,
              visibility: isAdmin ? visibility : "PUBLIC",
            });

    try {
      await save();
      navigate("/todos");
    } catch (err) {
      setError(getApiError(err));
    }
    // Deliberately after the try/catch rather than in a `finally`: React
    // Compiler bails out of any function containing one, and nothing here
    // returns early, so this runs on both paths exactly as `finally` did.
    setSubmitting(false);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {isEdit ? "Edit Todo" : "New Todo"}
        </h1>
        <p className="text-muted-foreground">
          {isEdit
            ? "Update what this task says and who can see it."
            : "Add a task for your gym team to pick up."}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Task</CardTitle>
            <CardDescription>What needs doing, and any context for it.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="todo-title">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="todo-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter todo title"
                required
                minLength={2}
                maxLength={200}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="todo-description">Description</Label>
              <Textarea
                id="todo-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add context, next steps, or notes"
                className="min-h-32"
                maxLength={2000}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="todo-visibility">Visibility</Label>
              <Select
                value={isAdmin ? visibility : "PUBLIC"}
                disabled={!isAdmin}
                onValueChange={(value) => setVisibility((value ?? "") as TodoVisibility)}
              >
                <SelectTrigger id="todo-visibility" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PUBLIC">Public</SelectItem>
                  <SelectItem value="PROTECTED">Protected</SelectItem>
                  <SelectItem value="PRIVATE">Private</SelectItem>
                </SelectContent>
              </Select>
              {!isAdmin && (
                <p className="text-xs text-muted-foreground">
                  Coaches can only create public todos.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/todos")}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || !title.trim()}>
            {submitting ? "Saving..." : isEdit ? "Update Todo" : "Create Todo"}
          </Button>
        </div>
      </form>
    </div>
  );
}
