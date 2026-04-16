import { Button, Dropdown, Input, Label, Modal, Spinner, Table } from "@heroui/react";
import type { BackendTRPCRouter } from "@m5kdev/backend/types";
import { useAppTRPC } from "@m5kdev/frontend/modules/app/hooks/useAppTrpc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, MoreHorizontal, Search, Trash2, UserPlus, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";

export function AdminWaitlist() {
  const trpc = useAppTRPC<BackendTRPCRouter>();
  const queryClient = useQueryClient();

  const { data: waitlist = [], isLoading } = useQuery(trpc.auth.listAdminWaitlist.queryOptions());
  const { mutate: invite, isPending: isInviting } = useMutation(
    trpc.auth.inviteFromWaitlist.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.auth.listAdminWaitlist.queryKey() });
        toast.success("Invitation sent successfully");
      },
      onError: (error) => {
        toast.error(
          `Failed to send invitation: ${error instanceof Error ? error.message : String(error)}`
        );
      },
    })
  );
  const { mutate: remove, isPending: isRemoving } = useMutation(
    trpc.auth.removeFromWaitlist.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.auth.listAdminWaitlist.queryKey() });
        toast.success("Removed from waitlist successfully");
      },
      onError: (error) => {
        toast.error(`Failed to remove: ${error instanceof Error ? error.message : String(error)}`);
      },
      onSettled: () => {
        setItemToDelete(null);
      },
    })
  );
  const { mutate: add, isPending: isAdding } = useMutation(
    trpc.auth.addToWaitlist.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.auth.listAdminWaitlist.queryKey() });
        toast.success("Added to waitlist successfully");
      },
      onError: (error) => {
        toast.error(
          `Failed to add to waitlist: ${error instanceof Error ? error.message : String(error)}`
        );
      },
    })
  );
  const emailInputId = useId();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const filteredWaitlist = waitlist.filter((item) =>
    item.email?.toLowerCase().includes(debouncedSearchQuery?.toLowerCase() ?? "")
  );

  const handleInvite = (id: string) => {
    invite({ id });
  };

  const handleRemove = () => {
    if (itemToDelete) {
      remove({ id: itemToDelete });
    }
  };

  const handleAdd = async () => {
    if (!newEmail.trim()) {
      toast.error("Please enter an email address");
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail.trim())) {
      toast.error("Please enter a valid email address");
      return;
    }

    add({ email: newEmail.trim() });
    setNewEmail("");
    setIsAddModalOpen(false);
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return "N/A";
    const dateObj = typeof date === "string" ? new Date(date) : date;
    return dateObj.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (status: string) => {
    const statusLower = status.toLowerCase();
    if (statusLower === "invited" || statusLower === "active") {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          {status}
        </span>
      );
    }
    if (statusLower === "pending") {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
          {status}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
        {status}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Waitlist Management</h2>
        <div className="flex items-center gap-2">
          <Button onPress={() => setIsAddModalOpen(true)} size="sm">
            <UserPlus className="h-4 w-4 mr-2" />
            Add to Waitlist
          </Button>
          <div className="text-sm text-muted-foreground">Total: {waitlist.length}</div>
        </div>
      </div>

      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <form
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            setDebouncedSearchQuery(searchQuery);
          }}
        >
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="Search by email"
            placeholder="Search by email..."
            className="pl-8 w-full"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            variant="secondary"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </form>
      </div>

      <div className="border rounded-lg overflow-hidden">
        {filteredWaitlist.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {searchQuery
              ? "No waitlist entries found matching your search"
              : "No waitlist entries found"}
          </div>
        ) : (
          <Table aria-label="Waitlist table">
            <Table.ScrollContainer>
              <Table.Content>
                <Table.Header>
                  <Table.Column>Email</Table.Column>
                  <Table.Column>Status</Table.Column>
                  <Table.Column>Created At</Table.Column>
                  <Table.Column>Updated At</Table.Column>
                  <Table.Column className="text-right">Actions</Table.Column>
                </Table.Header>
                <Table.Body items={filteredWaitlist}>
                  {(item) => (
                    <Table.Row id={item.id}>
                      <Table.Cell className="font-medium">{item.email}</Table.Cell>
                      <Table.Cell>{getStatusBadge(item.status)}</Table.Cell>
                      <Table.Cell>{formatDate(item.createdAt)}</Table.Cell>
                      <Table.Cell>{formatDate(item.updatedAt)}</Table.Cell>
                      <Table.Cell className="text-right">
                        <Dropdown>
                          <Dropdown.Trigger>
                            <Button
                              variant="ghost"
                              size="sm"
                              isIconOnly
                              aria-label="Waitlist row actions"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </Dropdown.Trigger>
                          <Dropdown.Popover placement="bottom end">
                            <Dropdown.Menu aria-label="Waitlist actions">
                              <Dropdown.Item
                                key="invite"
                                onPress={() => handleInvite(item.id)}
                                isDisabled={isInviting}
                              >
                                {isInviting ? (
                                  <>
                                    <Spinner className="mr-2 h-3 w-3" />
                                    Inviting...
                                  </>
                                ) : (
                                  <>
                                    <Mail className="mr-2 h-4 w-4" />
                                    Send Invitation
                                  </>
                                )}
                              </Dropdown.Item>
                              <Dropdown.Item
                                key="remove"
                                className="text-danger"
                                onPress={() => setItemToDelete(item.id)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Remove
                              </Dropdown.Item>
                            </Dropdown.Menu>
                          </Dropdown.Popover>
                        </Dropdown>
                      </Table.Cell>
                    </Table.Row>
                  )}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        )}
      </div>

      {/* Remove confirmation modal */}
      <Modal
        isOpen={!!itemToDelete}
        onOpenChange={(open) => {
          if (!open) setItemToDelete(null);
        }}
      >
        <Modal.Backdrop />
        <Modal.Container>
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading className="text-lg font-semibold">Are you sure?</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <p className="text-sm text-muted-foreground">
                This action cannot be undone. This will permanently remove this entry from the
                waitlist.
              </p>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="outline" onPress={() => setItemToDelete(null)}>
                Cancel
              </Button>
              <Button variant="danger" onPress={handleRemove} isPending={isRemoving}>
                Remove
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal>

      {/* Add to waitlist modal */}
      <Modal
        isOpen={isAddModalOpen}
        onOpenChange={(open) => {
          if (!open) setIsAddModalOpen(false);
        }}
      >
        <Modal.Backdrop />
        <Modal.Container>
          <Modal.Dialog>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAdd();
              }}
              className="contents"
            >
              <Modal.Header>
                <Modal.Heading className="text-lg font-semibold">Add to Waitlist</Modal.Heading>
              </Modal.Header>

              <Modal.Body className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Enter an email address to add someone to the waitlist.
                </p>
                <div className="space-y-2">
                  <Label htmlFor={emailInputId}>Email *</Label>
                  <Input
                    id={emailInputId}
                    type="email"
                    placeholder="Enter email address"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    variant="secondary"
                  />
                </div>
              </Modal.Body>

              <Modal.Footer>
                <Button variant="outline" type="button" onPress={() => setIsAddModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" isDisabled={isAdding} isPending={isAdding}>
                  {isAdding ? "Adding..." : "Add to Waitlist"}
                </Button>
              </Modal.Footer>
            </form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal>
    </div>
  );
}
