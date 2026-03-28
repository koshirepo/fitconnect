import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Search, X } from "lucide-react";
import type { TenantMember } from "@/types/api";
import AvatarCard from "@/components/ui/avatarCard";
import * as React from "react";

interface MemberSelectorProps {
  members: TenantMember[];
  selectedMember: TenantMember | null;
  onSelect: (member: TenantMember) => void;
  placeholder?: string;
  title?: string;
  description?: string;
}

export default function MemberSelector({
  members,
  selectedMember,
  onSelect,
  placeholder = "Select a member...",
  title = "Select Member",
  description = "Choose a member from the gym roster.",
}: MemberSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const filteredMembers = members.filter((m) =>
    `${m.name} ${m.email} ${m.memberId ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  const handleSelect = (member: TenantMember) => {
    onSelect(member);
    setOpen(false);
    setSearch("");
  };

  return (
    <>
      {/* Trigger Button */}
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="w-full justify-start text-base font-normal h-auto p-2"
      >
        {selectedMember ? (
          <AvatarCard
            name={selectedMember.name}
            avatarUrl={selectedMember.avatarUrl}
            memberId={selectedMember.memberId}
            variant="sm"
          >
            <div className="text-xs text-muted-foreground">
              {selectedMember.phone && <p>{selectedMember.phone}</p>}
            </div>
          </AvatarCard>
        ) : (
          <span className="text-muted-foreground">{placeholder}</span>
        )}
      </Button>

      {/* Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 pr-10"
                autoFocus
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Member List */}
            <div className="max-h-96 overflow-y-auto space-y-2">
              {filteredMembers.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">
                  No members found
                </p>
              ) : (
                filteredMembers.map((m) => (
                  <Card
                    key={m.id}
                    className="cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => handleSelect(m)}
                  >
                    <div className="p-3">
                      <AvatarCard
                        name={m.name}
                        avatarUrl={m.avatarUrl}
                        memberId={m.memberId}
                        variant="sm"
                      >
                        <div className="text-xs text-muted-foreground space-y-1">
                          {m.phone && <p>{m.phone}</p>}
                        </div>
                      </AvatarCard>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
