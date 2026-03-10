import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@heroui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, MoreHorizontal, Search, Trash2, UserPlus, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import type { UseBackendTRPC } from "../../../types";

interface AdminWaitlistProps {
  useTRPC: UseBackendTRPC;
}

export function AdminWaitlist({ useTRPC }: AdminWaitlistProps) {
  const trpc = useTRPC();
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
            variant="bordered"
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
        <Table aria-label="Waitlist table" removeWrapper>
          <TableHeader>
            <TableColumn>Email</TableColumn>
            <TableColumn>Status</TableColumn>
            <TableColumn>Created At</TableColumn>
            <TableColumn>Updated At</TableColumn>
            <TableColumn className="text-right">Actions</TableColumn>
          </TableHeader>
          <TableBody
            items={filteredWaitlist}
            emptyContent={
              searchQuery
                ? "No waitlist entries found matching your search"
                : "No waitlist entries found"
            }
          >
            {(item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.email}</TableCell>
                <TableCell>{getStatusBadge(item.status)}</TableCell>
                <TableCell>{formatDate(item.createdAt)}</TableCell>
                <TableCell>{formatDate(item.updatedAt)}</TableCell>
                <TableCell className="text-right">
                  <Dropdown placement="bottom-end">
                    <DropdownTrigger>
                      <Button variant="light" size="sm" isIconOnly>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownTrigger>
                    <DropdownMenu aria-label="Waitlist actions">
                      <DropdownItem
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
                      </DropdownItem>
                      <DropdownItem
                        key="remove"
                        className="text-danger"
                        onClick={() => setItemToDelete(item.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Remove
                      </DropdownItem>
                    </DropdownMenu>
                  </Dropdown>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Remove confirmation modal */}
      <Modal
        isOpen={!!itemToDelete}
        onOpenChange={(open) => {
          if (!open) setItemToDelete(null);
        }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <p className="text-lg font-semibold">Are you sure?</p>
                <p className="text-sm text-default-600">
                  This action cannot be undone. This will permanently remove this entry from the
                  waitlist.
                </p>
              </ModalHeader>
              <ModalFooter>
                <Button variant="bordered" onPress={onClose}>
                  Cancel
                </Button>
                <Button color="danger" onPress={handleRemove} isLoading={isRemoving}>
                  Remove
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Add to waitlist modal */}
      <Modal
        isOpen={isAddModalOpen}
        onOpenChange={(open) => {
          if (!open) setIsAddModalOpen(false);
        }}
      >
        <ModalContent>
          {(onClose) => (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAdd();
              }}
              className="space-y-4"
            >
              <ModalHeader className="flex flex-col gap-1">
                <p className="text-lg font-semibold">Add to Waitlist</p>
                <p className="text-sm text-default-600">
                  Enter an email address to add someone to the waitlist.
                </p>
              </ModalHeader>

              <ModalBody className="space-y-4">
                <div className="space-y-2">
                  <Input
                    id={emailInputId}
                    label="Email *"
                    labelPlacement="outside"
                    type="email"
                    placeholder="Enter email address"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    variant="bordered"
                  />
                </div>
              </ModalBody>

              <ModalFooter>
                <Button variant="bordered" type="button" onPress={onClose}>
                  Cancel
                </Button>
                <Button type="submit" color="primary" isDisabled={isAdding} isLoading={isAdding}>
                  {isAdding ? "Adding..." : "Add to Waitlist"}
                </Button>
              </ModalFooter>
            </form>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
