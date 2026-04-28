import React from "react";
import { Box, Text, useInput } from "ink";

export interface TextInputProps {
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
}

export function TextInput({
  value,
  placeholder,
  onChange,
  onSubmit,
}: TextInputProps): React.ReactElement {
  useInput((input, key) => {
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
  });

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
