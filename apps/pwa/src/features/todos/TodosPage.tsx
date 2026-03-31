import * as React from "react";
import { Navigate } from "react-router-dom";
import { todosApi } from "@/api/todos";
import { getApiError } from "@/api/client";
import { useAuthStore } from "@/stores/auth";
import type { Todo, TodoVisibility } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageLoader, Spinner } from "@/components/ui/spinner";
import { appendUniqueById, useInfiniteScroll } from "@/lib/use-infinite-scroll";
import { formatDateTime } from "@/lib/utils";
import { Edit, Lock, Plus, Search, Shield, Trash2 } from "lucide-react";

type TodoStatusFilter = "ALL" | "OPEN" | "COMPLETED";

function visibilityMeta(visibility: TodoVisibility) {
  switch (visibility) {
    case "PRIVATE":
      return {
        label: "Private",
        variant: "destructive" as const,
        Icon: Lock,
      };
    case "PROTECTED":
      return {
        label: "Protected",
        variant: "warning" as const,
        Icon: Shield,
      };
    default:
      return {
        label: "Public",
        variant: "success" as const,
        Icon: Plus,
      };
  }
}

export default function TodosPage() {
  const { currentTenantId, tenantRole } = useAuthStore();
  const role = tenantRole();
  const isAdmin = role === "ADMIN";
  const canAccess = isAdmin || role === "COACH";

  const [todos, setTodos] = React.useState<Todo[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [hasMore, setHasMore] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [statusFilter, setStatusFilter] =
    React.useState<TodoStatusFilter>("ALL");
  const [searchText, setSearchText] = React.useState("");
  const deferredSearch = React.useDeferredValue(searchText);
  const [error, setError] = React.useState("");

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingTodo, setEditingTodo] = React.useState<Todo | null>(null);
  const [formTitle, setFormTitle] = React.useState("");
  const [formDescription, setFormDescription] = React.useState("");
  const [formVisibility, setFormVisibility] =
    React.useState<TodoVisibility>("PUBLIC");
  const [formError, setFormError] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<Todo | null>(null);

  const fetchTodos = React.useCallback(
    async (nextPage: number, mode: "replace" | "append") => {
      if (!currentTenantId || !canAccess) return;

      if (mode === "replace") {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      try {
        const res = await todosApi.list(
          currentTenantId,
          nextPage,
          20,
          statusFilter,
          deferredSearch.trim() || undefined,
        );
        const nextTodos = res.data.data.todos;
        setTodos((prev) =>
          mode === "replace" ? nextTodos : appendUniqueById(prev, nextTodos),
        );
        setHasMore(nextPage < res.data.meta.totalPages);
        setPage(nextPage);
        setError("");
      } catch (err) {
        if (mode === "replace") {
          setTodos([]);
        }
        setError(getApiError(err));
      } finally {
        if (mode === "replace") {
          setLoading(false);
        } else {
          setLoadingMore(false);
        }
      }
    },
    [currentTenantId, canAccess, deferredSearch, statusFilter],
  );

  React.useEffect(() => {
    if (!currentTenantId || !canAccess) {
      setLoading(false);
      return;
    }

    setTodos([]);
    setHasMore(true);
    void fetchTodos(1, "replace");
  }, [currentTenantId, canAccess, fetchTodos]);

  const loadMore = React.useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    void fetchTodos(page + 1, "append");
  }, [fetchTodos, hasMore, loading, loadingMore, page]);

  const loadMoreRef = useInfiniteScroll({
    hasMore,
    loading: loading || loadingMore,
    onLoadMore: loadMore,
  });

  const canMutateTodo = React.useCallback(
    (todo: Todo) => isAdmin || todo.visibility === "PUBLIC",
    [isAdmin],
  );

  const openCreate = () => {
    setEditingTodo(null);
    setFormTitle("");
    setFormDescription("");
    setFormVisibility("PUBLIC");
    setFormError("");
    setDialogOpen(true);
  };

  const openEdit = (todo: Todo) => {
    setEditingTodo(todo);
    setFormTitle(todo.title);
    setFormDescription(todo.description ?? "");
    setFormVisibility(todo.visibility);
    setFormError("");
    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenantId) return;

    setSubmitting(true);
    setFormError("");
    try {
      if (editingTodo) {
        await todosApi.update(currentTenantId, editingTodo.id, {
          title: formTitle.trim(),
          description: formDescription.trim() ? formDescription.trim() : null,
          ...(isAdmin ? { visibility: formVisibility } : {}),
        });
      } else {
        await todosApi.create(currentTenantId, {
          title: formTitle.trim(),
          description: formDescription.trim() || undefined,
          visibility: isAdmin ? formVisibility : "PUBLIC",
        });
      }

      setDialogOpen(false);
      void fetchTodos(1, "replace");
    } catch (err) {
      setFormError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleCompleted = async (todo: Todo, nextValue: boolean) => {
    if (!currentTenantId || !canMutateTodo(todo)) return;

    try {
      await todosApi.update(currentTenantId, todo.id, {
        isCompleted: nextValue,
      });
      void fetchTodos(1, "replace");
    } catch (err) {
      setError(getApiError(err));
    }
  };

  const handleDelete = (todo: Todo) => {
    setPendingDelete(todo);
    setConfirmOpen(true);
  };

  const handleDeleteConfirmed = async () => {
    if (!currentTenantId || !pendingDelete) return;

    try {
      await todosApi.delete(currentTenantId, pendingDelete.id);
      void fetchTodos(1, "replace");
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setPendingDelete(null);
    }
  };

  if (!canAccess) {
    return <Navigate to="/dashboard" replace />;
  }

  if (loading) {
    return <PageLoader />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Todos</h1>
          <p className="text-muted-foreground">
            Admins can manage all todos. Coaches can create and manage public
            todos and view protected ones.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          New Todo
        </Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search by title or description"
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as TodoStatusFilter)
          }
        >
          <option value="ALL">All todos</option>
          <option value="OPEN">Open only</option>
          <option value="COMPLETED">Completed only</option>
        </Select>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {todos.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No todos found"
          description={
            deferredSearch.trim() || statusFilter !== "ALL"
              ? "Try changing the search or filter."
              : "Create the first todo for your gym team."
          }
          action={
            !deferredSearch.trim() && statusFilter === "ALL" ? (
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Create Todo
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="grid gap-4">
            {todos.map((todo) => {
              const meta = visibilityMeta(todo.visibility);
              const readOnly = !canMutateTodo(todo);

              return (
                <Card key={todo.id} className={todo.isCompleted ? "opacity-75" : ""}>
                  <CardHeader className="gap-3 pb-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={todo.isCompleted}
                          disabled={readOnly}
                          onChange={(e) =>
                            handleToggleCompleted(todo, e.target.checked)
                          }
                          className="mt-1"
                        />
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <CardTitle
                              className={
                                todo.isCompleted ? "line-through text-muted-foreground" : ""
                              }
                            >
                              {todo.title}
                            </CardTitle>
                            <Badge variant={meta.variant}>
                              <meta.Icon className="mr-1 h-3 w-3" />
                              {meta.label}
                            </Badge>
                            {todo.isCompleted && (
                              <Badge variant="outline">Completed</Badge>
                            )}
                            {readOnly && (
                              <Badge variant="secondary">Read only for coaches</Badge>
                            )}
                          </div>
                          {todo.description && (
                            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                              {todo.description}
                            </p>
                          )}
                        </div>
                      </div>

                      {canMutateTodo(todo) && (
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openEdit(todo)}
                          >
                            <Edit className="h-3 w-3" />
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(todo)}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      <span>
                        Created by {todo.createdBy?.name ?? "Unknown"} on{" "}
                        {formatDateTime(todo.createdAt)}
                      </span>
                      <span>Updated {formatDateTime(todo.updatedAt)}</span>
                    </div>
                    {todo.isCompleted && todo.completedAt && (
                      <p>
                        Completed by {todo.completedBy?.name ?? "Unknown"} on{" "}
                        {formatDateTime(todo.completedAt)}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {(hasMore || loadingMore) && (
            <div
              ref={loadMoreRef}
              className="flex items-center justify-center py-4 text-sm text-muted-foreground"
            >
              {loadingMore ? (
                <div className="flex items-center gap-2">
                  <Spinner size="sm" />
                  Loading more...
                </div>
              ) : (
                "Scroll to load more"
              )}
            </div>
          )}
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent onClose={() => setDialogOpen(false)} className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingTodo ? "Edit Todo" : "Create Todo"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="todo-title">Title</Label>
              <Input
                id="todo-title"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Enter todo title"
                required
                minLength={2}
                maxLength={200}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="todo-description">Description</Label>
              <Textarea
                id="todo-description"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Add context, next steps, or notes"
                className="min-h-32"
                maxLength={2000}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="todo-visibility">Visibility</Label>
              <Select
                id="todo-visibility"
                value={isAdmin ? formVisibility : "PUBLIC"}
                disabled={!isAdmin}
                onChange={(e) =>
                  setFormVisibility(e.target.value as TodoVisibility)
                }
              >
                <option value="PUBLIC">Public</option>
                <option value="PROTECTED">Protected</option>
                <option value="PRIVATE">Private</option>
              </Select>
              {!isAdmin && (
                <p className="text-xs text-muted-foreground">
                  Coaches can only create public todos.
                </p>
              )}
            </div>

            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting
                  ? "Saving..."
                  : editingTodo
                    ? "Update Todo"
                    : "Create Todo"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete todo?"
        description={
          pendingDelete
            ? `This will permanently remove "${pendingDelete.title}".`
            : "This will permanently remove the selected todo."
        }
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirmed}
      />
    </div>
  );
}
