import { Icon } from '@yusr/ui';

export function NoAccess({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border-strong p-12 text-center text-muted-foreground">
      <Icon name="lock" size={28} />
      <p>{message}</p>
    </div>
  );
}
