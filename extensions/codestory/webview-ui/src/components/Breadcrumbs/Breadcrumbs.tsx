import { IconPlant, IconChevronRight, IconLeaf } from "@tabler/icons-react";

type BreadcrumbsProps = {
  path: string[];
};

export const Breadcrumbs = ({ path }: BreadcrumbsProps) => {
  return (
    <ol className="flex flex-wrap gap-1 items-center text-cs-textSecondary text-sm whitespace-nowrap min-w-0 pb-2">
      <IconPlant className="flex-shrink-0 h-4" />
      {path.slice(0, -1).map((symbol, i) => (
        <li key={`${symbol}-${i}`}>
          <div className="flex items-center">
            {symbol}
            <IconChevronRight className="flex-shrink-0 h-4" />
          </div>
        </li>
      ))}
      <li className="font-semibold text-cs-textPrimary truncate">
        <div className="flex items-center">
          <IconLeaf className="flex-shrink-0 h-4" />
          {path.slice(-1)[0]}
        </div>
      </li>
    </ol>
  );
};
