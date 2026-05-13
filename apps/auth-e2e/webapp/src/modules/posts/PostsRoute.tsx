import { Button, Card, FieldError, Form, Input, Label, TextArea, TextField } from "@heroui/react";
import { useAppTRPC } from "@m5kdev/frontend/modules/app/hooks/useAppTrpc";
import {
  type QueryKey,
  type UseMutationOptions,
  type UseQueryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Newspaper, Plus } from "lucide-react";
import type { Post, PostCreateInput } from "m5kdev-auth-e2e-shared/modules/posts/posts.schema";
import type { FormEvent } from "react";
import { toast } from "sonner";

type PostsTrpc = {
  posts: {
    list: {
      queryOptions: () => UseQueryOptions<Post[], Error, Post[], QueryKey>;
      queryKey: () => QueryKey;
    };
    create: {
      mutationOptions: (
        options: Pick<UseMutationOptions<unknown, Error, PostCreateInput>, "onError" | "onSuccess">
      ) => UseMutationOptions<unknown, Error, PostCreateInput>;
    };
  };
};

export function PostsRoute() {
  const trpc = useAppTRPC() as unknown as PostsTrpc;
  const queryClient = useQueryClient();
  const postsQuery = useQuery(trpc.posts.list.queryOptions());
  const posts = postsQuery.data;
  const createPost = useMutation<unknown, Error, PostCreateInput>(
    trpc.posts.create.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.posts.list.queryKey() });
        toast.success("Post created");
      },
      onError: (error: unknown) => {
        toast.error(error instanceof Error ? error.message : "Failed to create post");
      },
    })
  );

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    createPost.mutate({
      title: String(formData.get("title") ?? ""),
      excerpt: String(formData.get("excerpt") ?? ""),
      content: String(formData.get("content") ?? ""),
    });
    event.currentTarget.reset();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <section className="grid gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-default-500">
            Protected blog
          </p>
          <h1 className="mt-2 font-editorial text-4xl">Editorial posts</h1>
        </div>
        {postsQuery.isLoading ? (
          <Card>
            <Card.Content>Loading posts...</Card.Content>
          </Card>
        ) : posts?.length ? (
          posts.map((post) => (
            <Card key={post.id}>
              <Card.Header className="flex items-start gap-3">
                <div className="rounded-md bg-default-100 p-2">
                  <Newspaper size={18} />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">{post.title}</h2>
                  <p className="text-sm text-default-600">{post.excerpt}</p>
                </div>
              </Card.Header>
              <Card.Content className="text-sm leading-6 text-default-700">
                {post.content}
              </Card.Content>
            </Card>
          ))
        ) : (
          <Card>
            <Card.Content>No posts yet.</Card.Content>
          </Card>
        )}
      </section>

      <Card>
        <Card.Header className="flex flex-col items-start gap-1">
          <h2 className="text-lg font-semibold">Create post</h2>
          <p className="text-sm text-default-600">A tiny workflow for authenticated users.</p>
        </Card.Header>
        <Card.Content>
          <Form onSubmit={onSubmit} className="grid gap-4">
            <TextField name="title" isRequired variant="secondary">
              <Label>Title</Label>
              <Input placeholder="Release note" />
              <FieldError />
            </TextField>
            <TextField name="excerpt" isRequired variant="secondary">
              <Label>Excerpt</Label>
              <Input placeholder="Short summary" />
              <FieldError />
            </TextField>
            <TextField name="content" isRequired variant="secondary">
              <Label>Content</Label>
              <TextArea placeholder="Body copy" />
              <FieldError />
            </TextField>
            <Button type="submit" variant="primary" isPending={createPost.isPending}>
              <Plus size={16} />
              Publish
            </Button>
          </Form>
        </Card.Content>
      </Card>
    </div>
  );
}
