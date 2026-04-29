import type { Key } from "@react-types/shared";
import type { Meta, StoryObj } from "@storybook/react";
import type { ReactElement } from "react";
import { useState } from "react";

import { SimpleSelect } from "./SimpleSelect";

const sampleData = [
  { label: "California", value: "ca" },
  { label: "New York", value: "ny" },
  { label: "Texas", value: "tx" },
  { label: "Washington", value: "wa" },
];

const meta = {
  title: "components/ui/SimpleSelect",
  component: SimpleSelect,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
  args: {
    label: "State",
    "aria-label": "State",
    data: sampleData,
    defaultSelectedKey: "ny",
  },
} satisfies Meta<typeof SimpleSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: "State",
    "aria-label": "State",
    data: sampleData,
    defaultSelectedKey: "ny",
  },
};

export const Disabled: Story = {
  args: {
    label: "State",
    "aria-label": "State",
    data: sampleData,
    isDisabled: true,
    defaultSelectedKey: "tx",
  },
};

function ControlledSelectStory(): ReactElement {
  const [selectedKey, setSelectedKey] = useState<Key | null>("ca");

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <SimpleSelect
        label="State"
        aria-label="State"
        data={sampleData}
        value={selectedKey}
        selectionMode="single"
        onChange={setSelectedKey}
      />
      <p className="text-sm text-default-500">
        Selected: {selectedKey == null ? "none" : String(selectedKey)}
      </p>
    </div>
  );
}

export const Controlled: Story = {
  args: {
    label: "State",
    "aria-label": "State",
    data: sampleData,
  },
  render: () => <ControlledSelectStory />,
};
