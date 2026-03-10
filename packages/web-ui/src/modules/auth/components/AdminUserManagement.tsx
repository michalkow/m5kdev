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
  Select,
  SelectItem,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tooltip,
} from "@heroui/react";
import { authClient } from "@m5kdev/frontend/modules/auth/auth.lib";
import * as authAdmin from "@m5kdev/frontend/modules/auth/hooks/useAuthAdmin";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Copy,
  Filter,
  Info,
  Link2,
  List,
  MoreHorizontal,
  Search,
  UserPlus,
  X,
} from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import type { UseBackendTRPC } from "#types";

type SortField = "name" | "email" | "role" | "createdAt";
type SortOrder = "asc" | "desc";
type StatusFilter = "all" | "banned" | "active";

interface AdminUserManagementProps {
  useTRPC?: UseBackendTRPC;
}

export function AdminUserManagement({ useTRPC }: AdminUserManagementProps) {
  const banReasonInputId = useId();
  const customDurationId = useId();
  const nameInputId = useId();
  const emailInputId = useId();
  const passwordInputId = useId();
  const roleSelectId = useId();
  const [page, setPage] = useState(0);
  const [limit] = useState(10);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [userToBan, setUserToBan] = useState<{ id: string; name: string } | null>(null);
  const [banReason, setBanReason] = useState("");
  const [banExpiry, setBanExpiry] = useState("never"); // "never", "1d", "7d", "30d", "custom"
  const [customBanDays, setCustomBanDays] = useState(1);
  const [isBanningUser, setIsBanningUser] = useState(false);
  const [isUnbanningUser, setIsUnbanningUser] = useState<Record<string, boolean>>({});
  const [isImpersonatingUser, setIsImpersonatingUser] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [isCreateUserModalOpen, setIsCreateUserModalOpen] = useState(false);
  const [newUserData, setNewUserData] = useState({
    name: "",
    email: "",
    password: "",
    role: "user",
  });
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [userForUsage, setUserForUsage] = useState<{ id: string; name: string } | null>(null);
  const [userForMagicLink, setUserForMagicLink] = useState<{
    id: string;
    name: string;
    email: string | null;
  } | null>(null);
  const [claimEmail, setClaimEmail] = useState("");
  const [generatedMagicLink, setGeneratedMagicLink] = useState<string | null>(null);
  const [isGeneratingMagicLink, setIsGeneratingMagicLink] = useState(false);
  const navigate = useNavigate();
  const magicLinkEmailInputId = useId();
  const generatedMagicLinkInputId = useId();

  // AI Usage query
  const trpc = useTRPC?.();
  const queryClient = useQueryClient();
  const usageQueryEnabled = !!userForUsage && !!trpc;
  const usageQueryOptions = trpc?.ai.getUserUsage.queryOptions({ userId: userForUsage?.id ?? "" });
  const usageQuery = useQuery({
    ...(usageQueryOptions ?? {
      queryKey: [["ai", "getUserUsage"], { input: { userId: "" } }] as const,
      queryFn: () =>
        Promise.resolve({ inputTokens: null, outputTokens: null, totalTokens: null, cost: null }),
    }),
    enabled: usageQueryEnabled,
  });
  const usageData = usageQuery.data;
  const isLoadingUsage = usageQuery.isLoading;

  const refetchUsage = () => {
    if (usageQueryOptions) {
      queryClient.invalidateQueries({ queryKey: usageQueryOptions.queryKey });
    }
  };

  // Reset page on filter change
  const resetPage = useCallback(() => {
    setPage(0);
  }, []);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      resetPage();
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, resetPage]);

  // Handle status filter change
  const handleStatusFilterChange = useCallback(
    (value: StatusFilter) => {
      setStatusFilter(value);
      resetPage();
    },
    [resetPage]
  );

  const {
    data: listUsers = {
      users: [],
      total: 0,
    },
    isLoading,
    refetch,
  } = authAdmin.useListUsers({
    query: {
      searchField: "name",
      searchOperator: "contains",
      searchValue: debouncedSearchQuery,
      limit,
      offset: page * limit,
      sortBy: sortField,
      sortDirection: sortOrder,
    },
  });

  const { users, total: totalUsers } = listUsers;

  const { mutate: deleteUser, isPending: isDeleting } = authAdmin.useRemoveUser({
    onSuccess: () => {
      toast.success("User deleted successfully");
      refetch();
    },
    onError: (error) => {
      toast.error(`Error deleting user: ${error.message}`);
    },
  });

  const { mutate: updateUser } = authAdmin.useUpdateUser({
    onSuccess: () => {
      toast.success("User updated successfully");
      refetch();
    },
    onError: (error) => {
      toast.error(`Error updating user: ${error.message}`);
    },
  });

  const totalPages = totalUsers ? Math.ceil(totalUsers / limit) : 0;

  const confirmDelete = (userId: string) => {
    setUserToDelete(userId);
  };

  const handleDelete = () => {
    if (userToDelete) {
      deleteUser({ id: userToDelete });
      setUserToDelete(null);
    }
  };

  const openBanModal = (userId: string, userName: string) => {
    setUserToBan({ id: userId, name: userName });
    setBanReason("");
    setBanExpiry("never");
    setCustomBanDays(1);
  };

  const getBanExpiryInSeconds = () => {
    switch (banExpiry) {
      case "never":
        return undefined; // No expiry
      case "1d":
        return 60 * 60 * 24; // 1 day in seconds
      case "7d":
        return 60 * 60 * 24 * 7; // 7 days in seconds
      case "30d":
        return 60 * 60 * 24 * 30; // 30 days in seconds
      case "custom":
        return 60 * 60 * 24 * customBanDays; // Custom days in seconds
      default:
        return undefined;
    }
  };

  const formatBanExpiry = (expiryTimestamp: number | null) => {
    if (!expiryTimestamp) return "Never";

    const expiryDate = new Date(expiryTimestamp);
    const now = new Date();

    // If it's expired, return that
    if (expiryDate < now) return "Expired";

    // Format the date
    const dateString = expiryDate.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    // Calculate time remaining
    const timeRemaining = expiryDate.getTime() - now.getTime();
    const daysRemaining = Math.ceil(timeRemaining / (1000 * 60 * 60 * 24));

    return `${dateString} (${daysRemaining} days)`;
  };

  const handleBanUser = async () => {
    if (!userToBan) return;

    try {
      setIsBanningUser(true);
      await authClient.admin.banUser({
        userId: userToBan.id,
        banReason: banReason || "No reason provided",
        banExpiresIn: getBanExpiryInSeconds(),
      });

      toast.success(`User ${userToBan.name} has been banned`);
      setUserToBan(null);
      await refetch();
    } catch (error) {
      toast.error(`Failed to ban user: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsBanningUser(false);
    }
  };

  const handleUnbanUser = async (userId: string) => {
    try {
      setIsUnbanningUser((prev) => ({ ...prev, [userId]: true }));
      await authClient.admin.unbanUser({
        userId,
      });

      toast.success("User has been unbanned");
      await refetch();
    } catch (error) {
      toast.error(
        `Failed to unban user: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setIsUnbanningUser((prev) => ({ ...prev, [userId]: false }));
    }
  };

  const handleSetOnboardingUser = async (userId: string) => {
    const onboardingStep = window.prompt(`Set onboarding step for user ${userId}`, "4");
    const onboardingStepNumber = Number.parseInt(onboardingStep || "0");
    if (onboardingStepNumber) {
      updateUser({
        userId,
        data: { onboarding: onboardingStepNumber },
      });
    }
  };

  const handleImpersonateUser = async (userId: string) => {
    try {
      setIsImpersonatingUser(true);
      await authClient.admin.impersonateUser({
        userId,
      });

      toast.success("Now impersonating user");
      window.location.assign("/"); // Force full reload to apply impersonated session immediately
    } catch (error) {
      setIsImpersonatingUser(false);
      toast.error(
        `Failed to impersonate user: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 0 && newPage < totalPages) {
      setPage(newPage);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Toggle order if same field
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      // Set new field and default to ascending
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return null;

    return sortOrder === "asc" ? (
      <ChevronUp className="h-4 w-4 inline ml-1" />
    ) : (
      <ChevronDown className="h-4 w-4 inline ml-1" />
    );
  };

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setSortField("createdAt");
    setSortOrder("desc");
  };

  const openCreateUserModal = () => {
    setNewUserData({
      name: "",
      email: "",
      password: "",
      role: "user",
    });
    setIsCreateUserModalOpen(true);
  };

  const handleCreateUser = async () => {
    if (!newUserData.name || !newUserData.email || !newUserData.password) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      setIsCreatingUser(true);
      await authClient.admin.createUser({
        name: newUserData.name,
        email: newUserData.email,
        password: newUserData.password,
        role: newUserData.role as "user" | "admin",
      });

      toast.success(`User ${newUserData.name} has been created`);
      setIsCreateUserModalOpen(false);
      await refetch();
    } catch (error) {
      toast.error(
        `Failed to create user: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleNewUserDataChange = (field: keyof typeof newUserData, value: string) => {
    setNewUserData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const openUsageModal = (userId: string, userName: string) => {
    setUserForUsage({ id: userId, name: userName });
    refetchUsage();
  };

  const formatTokenCount = (count: number | null | undefined): string => {
    if (count === null || count === undefined) return "—";
    return count.toLocaleString();
  };

  const formatCost = (cost: number | null | undefined): string => {
    if (cost === null || cost === undefined) return "—";
    return `$${cost.toFixed(4)}`;
  };

  const createAccountClaimCodeMutation = useMutation(
    trpc
      ? trpc.auth.createAccountClaimCode.mutationOptions()
      : {
          mutationFn: async () => {
            throw new Error("Account claim actions are not available in this app");
          },
        }
  );

  const generateAccountClaimMagicLinkMutation = useMutation(
    trpc
      ? trpc.auth.generateAccountClaimMagicLink.mutationOptions()
      : {
          mutationFn: async () => {
            throw new Error("Account claim actions are not available in this app");
          },
        }
  );

  const openMagicLinkModal = (userId: string, userName: string, userEmail: string | null) => {
    setUserForMagicLink({ id: userId, name: userName, email: userEmail });
    setClaimEmail(userEmail ?? "");
    setGeneratedMagicLink(null);
  };

  const handleGenerateMagicLink = async () => {
    if (!trpc) {
      toast.error("Account claim actions are not available in this app");
      return;
    }

    if (!userForMagicLink) return;

    const normalizedEmail = claimEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      toast.error("Email is required");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      toast.error("Please enter a valid email address");
      return;
    }

    try {
      setIsGeneratingMagicLink(true);
      const claim = await createAccountClaimCodeMutation.mutateAsync({
        userId: userForMagicLink.id,
      });
      const link = await generateAccountClaimMagicLinkMutation.mutateAsync({
        claimId: claim.id,
        email: normalizedEmail,
      });
      setGeneratedMagicLink(link.url);
      toast.success("Magic login link generated");
    } catch (error) {
      toast.error(
        `Failed to generate magic link: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setIsGeneratingMagicLink(false);
    }
  };

  const copyGeneratedMagicLink = async () => {
    if (!generatedMagicLink) return;

    try {
      await navigator.clipboard.writeText(generatedMagicLink);
      toast.success("Magic link copied");
    } catch {
      toast.error("Failed to copy link");
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );
  }

  const openWaitlistModal = () => {
    navigate("/admin/waitlist");
  };

  const hasActiveFilters =
    debouncedSearchQuery ||
    statusFilter !== "all" ||
    sortField !== "createdAt" ||
    sortOrder !== "desc";

  return (
    <div className="space-y-4 p-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">User Management</h2>
        <div className="flex items-center gap-2">
          <Button onPress={openWaitlistModal} size="sm">
            <List className="h-4 w-4 mr-2" />
            Waitlist
          </Button>
          <Button onPress={openCreateUserModal} size="sm">
            <UserPlus className="h-4 w-4 mr-2" />
            Create User
          </Button>
          <div className="text-sm text-muted-foreground">Total users: {totalUsers || 0}</div>
        </div>
      </div>

      {/* Search and filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <form
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            setDebouncedSearchQuery(searchQuery);
            resetPage();
          }}
        >
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="Search users"
            placeholder="Search users by name or email..."
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

        <div className="flex gap-2">
          <Select
            aria-label="Status filter"
            selectedKeys={new Set([statusFilter])}
            onSelectionChange={(keys) =>
              handleStatusFilterChange(Array.from(keys)[0] as StatusFilter)
            }
            className="w-[160px]"
            startContent={<Filter className="mr-1 h-4 w-4" />}
          >
            <SelectItem key="all">All Users</SelectItem>
            <SelectItem key="active">Active Only</SelectItem>
            <SelectItem key="banned">Banned Only</SelectItem>
          </Select>

          {hasActiveFilters && (
            <Button variant="bordered" size="sm" onPress={clearFilters}>
              <X className="mr-1 h-4 w-4" />
              Clear Filters
            </Button>
          )}
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table aria-label="Users table" removeWrapper>
          <TableHeader>
            <TableColumn>ID</TableColumn>
            <TableColumn className="cursor-pointer" onClick={() => handleSort("name")}>
              Name {renderSortIcon("name")}
            </TableColumn>
            <TableColumn className="cursor-pointer" onClick={() => handleSort("email")}>
              Email {renderSortIcon("email")}
            </TableColumn>
            <TableColumn className="cursor-pointer" onClick={() => handleSort("role")}>
              Role {renderSortIcon("role")}
            </TableColumn>
            <TableColumn>Status</TableColumn>
            <TableColumn>Onboarding</TableColumn>
            <TableColumn className="cursor-pointer" onClick={() => handleSort("createdAt")}>
              Created At {renderSortIcon("createdAt")}
            </TableColumn>
            <TableColumn className="text-right">Actions</TableColumn>
          </TableHeader>
          <TableBody
            items={users ?? []}
            emptyContent={
              hasActiveFilters ? "No users found matching your filters" : "No users found"
            }
          >
            {(user) => {
              const onboarding = (user as { onboarding?: string | number }).onboarding;
              return (
                <TableRow key={user.id}>
                  <TableCell className="font-mono text-xs">{user.id}</TableCell>
                  <TableCell>{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.role || "user"}</TableCell>
                  <TableCell>
                    {user.banned ? (
                      <Tooltip
                        content={
                          <div className="space-y-1 text-xs">
                            <p>
                              <strong>Reason:</strong> {user.banReason || "No reason provided"}
                            </p>
                            {user.banExpires && (
                              <p className="flex items-center gap-1">
                                <CalendarClock className="h-3 w-3" />
                                <span>
                                  <strong>Expires:</strong>{" "}
                                  {formatBanExpiry(user.banExpires.getTime())}
                                </span>
                              </p>
                            )}
                          </div>
                        }
                      >
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          Banned
                          {user.banReason && <Info className="h-3 w-3" />}
                        </span>
                      </Tooltip>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Active
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{onboarding ?? "—"}</TableCell>
                  <TableCell>
                    {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "N/A"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Dropdown placement="bottom-end">
                      <DropdownTrigger>
                        <Button variant="light" size="sm" isIconOnly>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownTrigger>
                      <DropdownMenu aria-label="User actions">
                        <DropdownItem
                          key="onboarding"
                          onClick={() => handleSetOnboardingUser(user.id)}
                        >
                          Set Onboarding
                        </DropdownItem>
                        <DropdownItem
                          key="usage"
                          onClick={() => openUsageModal(user.id, user.name)}
                          className={useTRPC ? "" : "hidden"}
                        >
                          <span className="flex items-center gap-2">
                            <BarChart3 className="h-4 w-4" />
                            View AI Usage
                          </span>
                        </DropdownItem>
                        <DropdownItem
                          key="impersonate"
                          onClick={() => handleImpersonateUser(user.id)}
                          isDisabled={user.banned || isImpersonatingUser}
                        >
                          {isImpersonatingUser ? (
                            <>
                              <Spinner className="mr-2 h-3 w-3" />
                              Impersonating...
                            </>
                          ) : (
                            "Impersonate"
                          )}
                        </DropdownItem>
                        <DropdownItem
                          key="magic-link"
                          onClick={() => openMagicLinkModal(user.id, user.name, user.email ?? null)}
                          className={trpc ? "" : "hidden"}
                        >
                          <span className="flex items-center gap-2">
                            <Link2 className="h-4 w-4" />
                            Generate Magic Login Link
                          </span>
                        </DropdownItem>
                        {user.banned ? (
                          <DropdownItem
                            key="unban"
                            onClick={() => handleUnbanUser(user.id)}
                            isDisabled={isUnbanningUser[user.id]}
                          >
                            {isUnbanningUser[user.id] ? (
                              <>
                                <Spinner className="mr-2 h-3 w-3" />
                                Unbanning...
                              </>
                            ) : (
                              "Unban"
                            )}
                          </DropdownItem>
                        ) : (
                          <DropdownItem key="ban" onClick={() => openBanModal(user.id, user.name)}>
                            Ban
                          </DropdownItem>
                        )}
                        <DropdownItem key="remove" onClick={() => confirmDelete(user.id)}>
                          Remove
                        </DropdownItem>
                      </DropdownMenu>
                    </Dropdown>
                  </TableCell>
                </TableRow>
              );
            }}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 0 && (
        <div className="flex items-center justify-end space-x-2 py-4">
          <Button
            variant="bordered"
            size="sm"
            onClick={() => handlePageChange(page - 1)}
            isDisabled={page === 0}
          >
            Previous
          </Button>
          <div className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages}
          </div>
          <Button
            variant="bordered"
            size="sm"
            onClick={() => handlePageChange(page + 1)}
            isDisabled={page === totalPages - 1}
          >
            Next
          </Button>
        </div>
      )}

      {/* Delete confirmation modal */}
      <Modal
        isOpen={!!userToDelete}
        onOpenChange={(open) => {
          if (!open) setUserToDelete(null);
        }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <p className="text-lg font-semibold">Are you sure?</p>
                <p className="text-sm text-default-600">
                  This action cannot be undone. This will permanently delete the user and all their
                  data.
                </p>
              </ModalHeader>
              <ModalFooter>
                <Button variant="bordered" onPress={onClose}>
                  Cancel
                </Button>
                <Button color="danger" onPress={handleDelete} isLoading={isDeleting}>
                  Delete
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Ban user modal */}
      <Modal
        isOpen={!!userToBan}
        onOpenChange={(open) => {
          if (!open) setUserToBan(null);
        }}
      >
        <ModalContent>
          {(onClose) => (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleBanUser();
              }}
              className="space-y-4"
            >
              <ModalHeader className="flex flex-col gap-1">
                <p className="text-lg font-semibold">Ban User</p>
                <p className="text-sm text-default-600">
                  {userToBan &&
                    `You are about to ban ${userToBan.name}. This will prevent them from signing in.`}
                </p>
              </ModalHeader>

              <ModalBody className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor={banReasonInputId} className="text-sm font-medium">
                    Ban Reason
                  </label>
                  <Input
                    id={banReasonInputId}
                    placeholder="Enter reason for ban"
                    value={banReason}
                    onChange={(e) => setBanReason(e.target.value)}
                    variant="bordered"
                    labelPlacement="outside"
                    label="Ban Reason"
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Ban Duration</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={banExpiry === "never" ? "solid" : "bordered"}
                      onClick={() => setBanExpiry("never")}
                    >
                      Permanent
                    </Button>
                    <Button
                      type="button"
                      variant={banExpiry === "1d" ? "solid" : "bordered"}
                      onClick={() => setBanExpiry("1d")}
                    >
                      1 Day
                    </Button>
                    <Button
                      type="button"
                      variant={banExpiry === "7d" ? "solid" : "bordered"}
                      onClick={() => setBanExpiry("7d")}
                    >
                      7 Days
                    </Button>
                    <Button
                      type="button"
                      variant={banExpiry === "30d" ? "solid" : "bordered"}
                      onClick={() => setBanExpiry("30d")}
                    >
                      30 Days
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={customDurationId}
                      checked={banExpiry === "custom"}
                      onChange={(e) =>
                        e.target.checked ? setBanExpiry("custom") : setBanExpiry("never")
                      }
                    />
                    <label htmlFor={customDurationId} className="text-sm font-medium">
                      Custom Duration
                    </label>
                  </div>

                  {banExpiry === "custom" && (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="1"
                        value={customBanDays.toString()}
                        onChange={(e) => setCustomBanDays(Number(e.target.value))}
                        variant="bordered"
                        labelPlacement="outside"
                        label="Custom duration (days)"
                      />
                      <span className="text-sm">Days</span>
                    </div>
                  )}
                </div>
              </ModalBody>

              <ModalFooter>
                <Button variant="bordered" type="button" onPress={onClose}>
                  Cancel
                </Button>
                <Button color="danger" type="submit" isDisabled={isBanningUser}>
                  {isBanningUser ? <Spinner className="mr-2 h-4 w-4" /> : null}
                  {isBanningUser ? "Banning..." : "Ban User"}
                </Button>
              </ModalFooter>
            </form>
          )}
        </ModalContent>
      </Modal>

      {/* Create user modal */}
      <Modal
        isOpen={isCreateUserModalOpen}
        onOpenChange={(open) => {
          if (!open) setIsCreateUserModalOpen(false);
        }}
      >
        <ModalContent>
          {(onClose) => (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleCreateUser();
              }}
              className="space-y-4"
            >
              <ModalHeader className="flex flex-col gap-1">
                <p className="text-lg font-semibold">Create New User</p>
                <p className="text-sm text-default-600">
                  Fill in the details below to create a new user account.
                </p>
              </ModalHeader>

              <ModalBody className="space-y-4">
                <div className="space-y-2">
                  <Input
                    id={nameInputId}
                    label="Name *"
                    labelPlacement="outside"
                    placeholder="Enter user's name"
                    value={newUserData.name}
                    onChange={(e) => handleNewUserDataChange("name", e.target.value)}
                    variant="bordered"
                  />
                </div>

                <div className="space-y-2">
                  <Input
                    id={emailInputId}
                    label="Email *"
                    labelPlacement="outside"
                    type="email"
                    placeholder="Enter user's email"
                    value={newUserData.email}
                    onChange={(e) => handleNewUserDataChange("email", e.target.value)}
                    variant="bordered"
                  />
                </div>

                <div className="space-y-2">
                  <Input
                    id={passwordInputId}
                    label="Password *"
                    labelPlacement="outside"
                    type="password"
                    placeholder="Enter password"
                    value={newUserData.password}
                    onChange={(e) => handleNewUserDataChange("password", e.target.value)}
                    variant="bordered"
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium" id={roleSelectId}>
                    Role
                  </p>
                  <Select
                    aria-label="Select role"
                    aria-labelledby={roleSelectId}
                    selectedKeys={new Set([newUserData.role])}
                    onSelectionChange={(keys) =>
                      handleNewUserDataChange("role", Array.from(keys)[0] as string)
                    }
                  >
                    <SelectItem key="user">User</SelectItem>
                    <SelectItem key="admin">Admin</SelectItem>
                  </Select>
                </div>
              </ModalBody>

              <ModalFooter>
                <Button variant="bordered" type="button" onPress={onClose}>
                  Cancel
                </Button>
                <Button type="submit" color="primary" isDisabled={isCreatingUser}>
                  {isCreatingUser ? <Spinner className="mr-2 h-4 w-4" /> : null}
                  {isCreatingUser ? "Creating..." : "Create User"}
                </Button>
              </ModalFooter>
            </form>
          )}
        </ModalContent>
      </Modal>

      {/* AI Usage modal */}
      <Modal
        isOpen={!!userForUsage}
        onOpenChange={(open) => {
          if (!open) setUserForUsage(null);
        }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <p className="text-lg font-semibold flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  AI Usage
                </p>
                <p className="text-sm text-default-600">
                  {userForUsage && `Usage statistics for ${userForUsage.name}`}
                </p>
              </ModalHeader>

              <ModalBody>
                {isLoadingUsage ? (
                  <div className="flex justify-center py-8">
                    <Spinner />
                  </div>
                ) : usageData ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 rounded-lg bg-default-100">
                        <p className="text-sm text-default-600">Input Tokens</p>
                        <p className="text-2xl font-semibold">
                          {formatTokenCount(usageData.inputTokens)}
                        </p>
                      </div>
                      <div className="p-4 rounded-lg bg-default-100">
                        <p className="text-sm text-default-600">Output Tokens</p>
                        <p className="text-2xl font-semibold">
                          {formatTokenCount(usageData.outputTokens)}
                        </p>
                      </div>
                      <div className="p-4 rounded-lg bg-default-100">
                        <p className="text-sm text-default-600">Total Tokens</p>
                        <p className="text-2xl font-semibold">
                          {formatTokenCount(usageData.totalTokens)}
                        </p>
                      </div>
                      <div className="p-4 rounded-lg bg-primary-100">
                        <p className="text-sm text-primary-600">Estimated Cost</p>
                        <p className="text-2xl font-semibold text-primary">
                          {formatCost(usageData.cost)}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-default-600">No usage data available</div>
                )}
              </ModalBody>

              <ModalFooter>
                <Button variant="bordered" onPress={onClose}>
                  Close
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Magic login link modal */}
      <Modal
        isOpen={!!userForMagicLink}
        onOpenChange={(open) => {
          if (!open) {
            setUserForMagicLink(null);
            setGeneratedMagicLink(null);
            setClaimEmail("");
          }
        }}
      >
        <ModalContent>
          {(onClose) => (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleGenerateMagicLink();
              }}
              className="space-y-4"
            >
              <ModalHeader className="flex flex-col gap-1">
                <p className="text-lg font-semibold">Generate Magic Login Link</p>
                <p className="text-sm text-default-600">
                  {userForMagicLink &&
                    `Generate a one-time claim sign-in link for ${userForMagicLink.name}.`}
                </p>
              </ModalHeader>

              <ModalBody className="space-y-4">
                <Input
                  id={magicLinkEmailInputId}
                  label="Claim email"
                  labelPlacement="outside"
                  type="email"
                  placeholder="person@example.com"
                  value={claimEmail}
                  onChange={(e) => setClaimEmail(e.target.value)}
                  variant="bordered"
                  description="This email is used for provider linking and future sign-ins."
                />

                <Input
                  id={generatedMagicLinkInputId}
                  label="Generated link"
                  labelPlacement="outside"
                  value={generatedMagicLink ?? ""}
                  readOnly
                  variant="bordered"
                  placeholder="Generate link to see it here"
                />
              </ModalBody>

              <ModalFooter>
                <Button variant="bordered" type="button" onPress={onClose}>
                  Close
                </Button>
                <Button
                  variant="bordered"
                  type="button"
                  onPress={copyGeneratedMagicLink}
                  isDisabled={!generatedMagicLink}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Link
                </Button>
                <Button color="primary" type="submit" isDisabled={isGeneratingMagicLink}>
                  {isGeneratingMagicLink ? <Spinner className="mr-2 h-4 w-4" /> : null}
                  {isGeneratingMagicLink ? "Generating..." : "Generate Link"}
                </Button>
              </ModalFooter>
            </form>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
