import * as React from "react";
import { usePermissions } from "@/features/auth/permission-gate";
import { Permission } from "@fitconnect/shared/types/permissions";
import { Navigate } from "react-router-dom";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { useDeleteTodo, useTodosInfinite, useUpdateTodo } from "@/api/queries/catalog";
import { flattenPages } from "@/api/queries/shared";
import { getApiError } from "@/api/client";
import type { Todo, TodoVisibility } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { ListPageSkeleton } from "@/components/ui/skeleton";
import { useInfiniteScroll } from "@/lib/use-infinite-scroll";
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
  const navigate = useAppNavigate();
  const { can } = usePermissions();
  const canAccess = can(Permission.TODOS_READ);
  // Todo deletion is the narrower grant; everything else follows TODOS_UPDATE.
  const isAdmin = can(Permission.TODOS_DELETE);

  const [statusFilter, setStatusFilter] = React.useState<TodoStatusFilter>("ALL");
  const [searchText, setSearchText] = React.useState("");
  const deferredSearch = React.useDeferredValue(searchText);
  const [error, setError] = React.useState("");

  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<Todo | null>(null);

  // Changing a filter re-keys the query, so react-query refetches and resets
  // pagination on its own — no manual "reset then fetch page 1" dance.
  const todosQuery = useTodosInfinite(
    { status: statusFilter, search: deferredSearch.trim() || undefined },
    { enabled: canAccess },
  );

  const todos = React.useMemo(() => flattenPages<Todo>(todosQuery.data?.pages), [todosQuery.data]);
  const loading = todosQuery.isLoading;
  const loadingMore = todosQuery.isFetchingNextPage;
  const hasMore = Boolean(todosQuery.hasNextPage);

  const updateTodo = useUpdateTodo();
  const deleteTodo = useDeleteTodo();

  const loadMoreRef = useInfiniteScroll({
    hasMore,
    loading: loading || loadingMore,
    onLoadMore: () => {
      if (todosQuery.hasNextPage && !todosQuery.isFetchingNextPage) {
        void todosQuery.fetchNextPage();
      }
    },
  });

  const canMutateTodo = React.useCallback(
    (todo: Todo) => isAdmin || todo.visibility === "PUBLIC",
    [isAdmin],
  );

  const handleToggleCompleted = async (todo: Todo, nextValue: boolean) => {
    if (!canMutateTodo(todo)) return;

    try {
      await updateTodo.mutateAsync({ todoId: todo.id, data: { isCompleted: nextValue } });
    } catch (err) {
      setError(getApiError(err));
    }
  };

  const handleDelete = (todo: Todo) => {
    setPendingDelete(todo);
    setConfirmOpen(true);
  };

  const handleDeleteConfirmed = async () => {
    if (!pendingDelete) return;

    try {
      await deleteTodo.mutateAsync(pendingDelete.id);
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
    return <ListPageSkeleton filters={1} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Todos</h1>
          <p className="text-muted-foreground">
            Admins can manage all todos. Coaches can create and manage public todos and view
            protected ones.
          </p>
        </div>
        <Button onClick={() => navigate("/todos/new")}>
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
          onValueChange={(value) => setStatusFilter((value ?? "") as TodoStatusFilter)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All todos</SelectItem>
            <SelectItem value="OPEN">Open only</SelectItem>
            <SelectItem value="COMPLETED">Completed only</SelectItem>
          </SelectContent>
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
              <Button onClick={() => navigate("/todos/new")}>
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
                          onCheckedChange={(checked) =>
                            handleToggleCompleted(todo, checked === true)
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
                            {todo.isCompleted && <Badge variant="outline">Completed</Badge>}
                            {readOnly && <Badge variant="secondary">Read only for coaches</Badge>}
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
                            onClick={() => navigate(`/todos/${todo.id}/edit`)}
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
