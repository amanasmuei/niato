import React from "react";
import { Box, Text, useInput } from "ink";

export interface TextInputProps {
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  // When false, the input handler does not fire — used by the parent
  // screen to modally suspend text capture during an approval prompt
  // (so 'a'/'d' keystrokes don't both resolve the prompt AND land in
  // the draft buffer). Defaults to true so the existing call sites
  // and test fixtures don't have to pass it.
  isActive?: boolean | undefined;
}

export function TextInput({
  value,
  placeholder,
  onChange,
  onSubmit,
  isActive,
}: TextInputProps): React.ReactElement {
  useInput(
    (input, key) => {
      if (key.return) {
        onSubmit(value);
        return;
      }
      if (key.backspace || key.delete) {
        onChange(value.slice(0, -1));
        return;
      }
      if (key.ctrl || key.meta) return;
      if (
        input.length > 0 &&
        !key.upArrow &&
        !key.downArrow &&
        !key.leftArrow &&
        !key.rightArrow
      ) {
        onChange(value + input);
      }
    },
    { isActive: isActive ?? true },
  );

  return (
    <Box>
      <Text color="cyan">{"› "}</Text>
      {value.length === 0 ? (
        <Text color="gray">{placeholder}</Text>
      ) : (
        <Text>{value}</Text>
      )}
    </Box>
  );
}
