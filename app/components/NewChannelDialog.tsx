import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { api, type Channel } from "../api.ts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "./shared.tsx";

/** Adds a channel with default settings; its page then sets the branding. */
export function NewChannelDialog({ trigger, onCreated }: { trigger: ReactNode; onCreated: (channel: Channel) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [language, setLanguage] = useState<"en" | "ar">("ar");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      const channel = await api.createChannel(name, language);
      setOpen(false);
      setName("");
      onCreated(channel);
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New channel</DialogTitle>
          <DialogDescription>Next, connect its YouTube account and import its style, or upload your logo and pictures.</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <Field label="Name">
            <Input autoFocus value={name} placeholder="Tech Versus" onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && name.trim() && create()} />
          </Field>
          <Field label="Language">
            <Select value={language} onValueChange={(value) => setLanguage(value as "en" | "ar")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ar">Arabic</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button disabled={!name.trim() || busy} onClick={create}>
            Create channel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
