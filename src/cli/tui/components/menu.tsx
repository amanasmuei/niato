import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

export interface MenuItem {
  id: string;
  label: string;
  detail?: string;
  disabled?: boolean;
}

export interface MenuProps {
  items: MenuItem[];
  onSelect: (id: string) => void;
  onCancel?: () => void;
}

function firstEnabledIndex(items: MenuItem[]): number {
  const i = items.findIndex((item) => item.disabled !== true);
  return i === -1 ? 0 : i;
}

export function Menu({
  items,
  onSelect,
  onCancel,
}: MenuProps): React.ReactElement {
  const [index, setIndex] = useState<number>(() => firstEnabledIndex(items));

  useInput((input, key) => {
    if (key.upArrow) {
      setIndex((i) => {
        for (let n = i - 1; n >= 0; n--) {
          if (items[n]?.disabled !== true) return n;
        }
        return i;
      });
    } else if (key.downArrow) {
      setIndex((i) => {
        for (let n = i + 1; n < items.length; n++) {
          if (items[n]?.disabled !== true) return n;
        }
        return i;
      });
    } else if (key.return) {
      const item = items[index];
      if (item && item.disabled !== true) onSelect(item.id);
    } else if (key.escape || input === "q") {
      onCancel?.();
    }
  });

  return (
    <Box flexDirection="column">
      {items.map((item, i) => {
        const selected = i === index;
        const arrow = selected ? "▸" : " ";
        // Under exactOptionalPropertyTypes, ink's `color` prop cannot accept
        // `undefined`. Build a textProps object that omits color when no color
        // applies (active, non-selected row), and explicitly sets it otherwise.
        const textProps: {
          bold: boolean;
          color?: string;
        } = { bold: selected };
        if (item.disabled === true) {
          textProps.color = "gray";
        } else if (selected) {
          textProps.color = "cyan";
        }
        return (
          <Box key={item.id}>
            <Text {...textProps}>{`${arrow} ${item.label}`}</Text>
            {item.detail !== undefined && (
              <Text color="gray">{`  · ${item.detail}`}</Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
