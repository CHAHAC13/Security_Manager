import { Download, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/SearchInput';

interface AccessMatrixToolbarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  onAddColumn: () => void;
  onExportCsv: () => void;
}

export function AccessMatrixToolbar({
  searchValue,
  onSearchChange,
  onAddColumn,
  onExportCsv,
}: AccessMatrixToolbarProps) {
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1 border-t border-slate-100">
      <div className="flex items-center space-x-3 w-full sm:w-auto">
        <Button
          variant="accent"
          icon={<Plus className="w-3.5 h-3.5" />}
          onClick={onAddColumn}
        >
          Add Column…
        </Button>

        <SearchInput
          value={searchValue}
          onChange={onSearchChange}
          className="flex-1 sm:w-64"
        />
      </div>

      <Button
        variant="secondary"
        icon={<Download className="w-3.5 h-3.5 text-slate-500" />}
        onClick={onExportCsv}
        className="ml-auto"
      >
        Export CSV
      </Button>
    </div>
  );
}
