/**
 * UI Components Showcase
 * Demonstration of all Atlassian Design System inspired components
 */

import React, { useState } from 'react';
import {
  Button,
  Box,
  Stack,
  Flex,
  Input,
  TextArea,
  Checkbox,
  Radio,
  Select,
  Toggle,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Badge,
  InlineMessage,
  Modal,
  Grid,
  Avatar,
  ProgressIndicator,
  EmptyState,
  Range,
  Breadcrumbs,
  Link,
  Menu,
  Pagination,
  Comment,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  SideNavigation,
  Tooltip,
  DatePicker,
  Banner,
  Lozenge,
} from './index';

export const UIComponentsShowcase: React.FC = () => {
  const [showModal, setShowModal] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [textAreaValue, setTextAreaValue] = useState('');
  const [checkboxChecked, setCheckboxChecked] = useState(false);
  const [radioValue, setRadioValue] = useState('option1');
  const [selectValue, setSelectValue] = useState('option1');
  const [toggleChecked, setToggleChecked] = useState(false);
  const [rangeValue, setRangeValue] = useState(50);
  const [progressValue, setProgressValue] = useState(65);
  const [currentPage, setCurrentPage] = useState(3);

  const menuItems = [
    { label: 'Edit', onClick: () => alert('Edit clicked') },
    { label: 'Copy', onClick: () => alert('Copy clicked') },
    { label: 'Duplicate', onClick: () => alert('Duplicate clicked') },
    { divider: true },
    { label: 'Delete', onClick: () => alert('Delete clicked'), disabled: true },
  ];

  const breadcrumbItems = [
    { label: 'Projects', href: '/projects' },
    { label: 'Video Editor', href: '/projects/video-editor' },
    { label: 'Timeline', isCurrentPage: true },
  ];

  const sampleComments = [
    {
      id: '1',
      author: { name: 'John Doe', avatar: undefined, timestamp: '2 hours ago' },
      content: 'This timeline looks great! I really like the smooth transitions.',
      isEdited: false,
      isCurrentUser: false,
      replies: [
        {
          id: '2',
          author: { name: 'Jane Smith', avatar: undefined, timestamp: '1 hour ago' },
          content: 'Thanks! I spent a lot of time perfecting those transitions.',
          isEdited: false,
          isCurrentUser: true,
        }
      ]
    },
    {
      id: '3',
      author: { name: 'Bob Johnson', avatar: undefined, timestamp: '30 minutes ago' },
      content: 'Could you add some background music to this section?',
      isEdited: false,
      isCurrentUser: false,
    }
  ];

  const selectOptions = [
    { value: 'option1', label: 'Option 1' },
    { value: 'option2', label: 'Option 2' },
    { value: 'option3', label: 'Option 3' },
  ];

  return (
    <Box padding="large" className="max-w-6xl mx-auto space-y-8">
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold text-[var(--color-text)]">
          Atlassian Design System Components
        </h1>
        <p className="text-[var(--color-text-secondary)] max-w-2xl mx-auto">
          A comprehensive collection of reusable UI components built following Atlassian Design System principles.
        </p>
      </div>

      {/* Buttons Section */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-[var(--color-text)]">Buttons</h2>
        <Stack spacing="medium" direction="row" wrap={true}>
          <Button variant="primary">Primary Button</Button>
          <Button variant="secondary">Secondary Button</Button>
          <Button variant="danger">Danger Button</Button>
          <Button variant="link">Link Button</Button>
          <Button variant="primary" size="small">Small Button</Button>
          <Button variant="primary" size="large">Large Button</Button>
          <Button variant="primary" isLoading>Loading Button</Button>
          <Button variant="primary" disabled>Disabled Button</Button>
        </Stack>
      </section>

      {/* Form Components */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-[var(--color-text)]">Form Components</h2>
        <Grid columns={2} spacing="large">
          <Stack spacing="medium">
            <Input
              label="Input Field"
              placeholder="Enter some text..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
            />
            <Input
              label="Input with Error"
              error="This field is required"
              placeholder="Enter some text..."
            />
            <Input
              label="Input with Description"
              description="This is a helpful description"
              placeholder="Enter some text..."
            />
            <TextArea
              label="Text Area"
              placeholder="Enter a longer message..."
              value={textAreaValue}
              onChange={(e) => setTextAreaValue(e.target.value)}
              rows={4}
            />
          </Stack>

          <Stack spacing="medium">
            <Checkbox
              label="Checkbox option"
              checked={checkboxChecked}
              onChange={(e) => setCheckboxChecked(e.target.checked)}
            />
            <div className="space-y-3">
              <Radio
                label="Radio option 1"
                name="radio-group"
                value="option1"
                checked={radioValue === 'option1'}
                onChange={(e) => setRadioValue(e.target.value)}
              />
              <Radio
                label="Radio option 2"
                name="radio-group"
                value="option2"
                checked={radioValue === 'option2'}
                onChange={(e) => setRadioValue(e.target.value)}
              />
            </div>
            <Select
              label="Select Dropdown"
              options={selectOptions}
              value={selectValue}
              onChange={(e) => setSelectValue(e.target.value)}
            />
            <Toggle
              label="Toggle Switch"
              checked={toggleChecked}
              onChange={(e) => setToggleChecked(e.target.checked)}
            />
          </Stack>
        </Grid>
      </section>

      {/* Range and Progress */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-[var(--color-text)]">Range & Progress</h2>
        <Grid columns={2} spacing="large">
          <Range
            label="Volume Control"
            value={rangeValue}
            onChange={setRangeValue}
            showValue
            valueFormatter={(value) => `${value}%`}
          />
          <Stack spacing="medium">
            <ProgressIndicator value={progressValue} showValue />
            <ProgressIndicator variant="circular" value={progressValue} showValue />
            <ProgressIndicator variant="circular" indeterminate size="large" />
          </Stack>
        </Grid>
      </section>

      {/* Status and Feedback */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-[var(--color-text)]">Status & Feedback</h2>
        <Stack spacing="medium">
          <Flex gap="medium" wrap={true}>
            <Badge variant="primary">Primary</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="success">Success</Badge>
            <Badge variant="warning">Warning</Badge>
            <Badge variant="error">Error</Badge>
          </Flex>

          <InlineMessage type="info">
            This is an informational message with helpful details.
          </InlineMessage>
          <InlineMessage type="success" title="Success!">
            Your action was completed successfully.
          </InlineMessage>
          <InlineMessage type="warning">
            Please review your input before proceeding.
          </InlineMessage>
          <InlineMessage type="error">
            An error occurred while processing your request.
          </InlineMessage>
        </Stack>
      </section>

      {/* Layout Components */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-[var(--color-text)]">Layout & Navigation</h2>

        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Overview</TabsTrigger>
            <TabsTrigger value="tab2">Settings</TabsTrigger>
            <TabsTrigger value="tab3">Advanced</TabsTrigger>
          </TabsList>

          <TabsContent value="tab1">
            <Box padding="medium" backgroundColor="var(--color-surface)">
              <p className="text-[var(--color-text)]">
                This is the overview tab content. You can organize different sections of your interface using tabs.
              </p>
            </Box>
          </TabsContent>

          <TabsContent value="tab2">
            <Box padding="medium" backgroundColor="var(--color-surface)">
              <p className="text-[var(--color-text)]">
                Settings panel content would go here.
              </p>
            </Box>
          </TabsContent>

          <TabsContent value="tab3">
            <Box padding="medium" backgroundColor="var(--color-surface)">
              <p className="text-[var(--color-text)]">
                Advanced options and configuration.
              </p>
            </Box>
          </TabsContent>
        </Tabs>
      </section>

      {/* Avatar and Interactive Elements */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-[var(--color-text)]">Avatars & Interactive Elements</h2>
        <Flex gap="medium" alignItems="center">
          <Avatar name="John Doe" size="large" />
          <Avatar name="Jane Smith" size="medium" />
          <Avatar name="Bob Johnson" size="small" />
          <Tooltip content="Click to view profile">
            <Avatar name="Alice Cooper" onClick={() => alert('Profile clicked!')} />
          </Tooltip>
        </Flex>
      </section>

      {/* Breadcrumbs */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-[var(--color-text)]">Breadcrumbs</h2>
        <Box padding="medium" backgroundColor="var(--color-surface)" borderRadius="var(--border-radius-medium)">
          <Breadcrumbs items={breadcrumbItems} />
        </Box>
      </section>

      {/* Links */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-[var(--color-text)]">Links</h2>
        <Stack spacing="medium" direction="row" wrap={true}>
          <Link href="#" variant="default">Default Link</Link>
          <Link href="#" variant="subtle">Subtle Link</Link>
          <Link href="#" variant="primary">Primary Link</Link>
          <Link href="#" disabled>Disabled Link</Link>
        </Stack>
      </section>

      {/* Menu */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-[var(--color-text)]">Menu</h2>
        <Menu
          trigger={<Button variant="secondary">Open Menu</Button>}
          items={menuItems}
          placement="bottom-start"
        />
      </section>

      {/* Date Picker */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-[var(--color-text)]">Date Picker</h2>
        <Box padding="medium" backgroundColor="var(--color-surface)" borderRadius="var(--border-radius-medium)">
          <DatePicker
            label="Select a date"
            placeholder="Choose date..."
            onChange={(date) => console.log('Selected date:', date)}
          />
        </Box>
      </section>

      {/* Banner */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-[var(--color-text)]">Banner</h2>
        <Stack spacing="medium">
          <Banner appearance="info" title="Information">
            This is an informational banner that provides helpful information to users.
          </Banner>
          <Banner
            appearance="success"
            title="Success!"
            actions={[
              { label: 'View Details', onClick: () => alert('Details clicked') }
            ]}
          >
            Your project has been saved successfully.
          </Banner>
          <Banner
            appearance="warning"
            title="Warning"
            onDismiss={() => alert('Banner dismissed')}
          >
            Please review your settings before proceeding.
          </Banner>
          <Banner appearance="error" title="Error">
            There was a problem processing your request.
          </Banner>
          <Banner appearance="announcement" title="New Feature">
            We've added a new collaboration feature! Check it out in your project settings.
          </Banner>
        </Stack>
      </section>

      {/* Lozenge */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-[var(--color-text)]">Lozenge</h2>
        <Flex gap="medium" wrap={true}>
          <Lozenge appearance="default">Default</Lozenge>
          <Lozenge appearance="success">Done</Lozenge>
          <Lozenge appearance="removed">Removed</Lozenge>
          <Lozenge appearance="inprogress">In Progress</Lozenge>
          <Lozenge appearance="new">New</Lozenge>
          <Lozenge appearance="moved">Moved</Lozenge>
        </Flex>
      </section>

      {/* Comments */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-[var(--color-text)]">Comments</h2>
        <Box padding="medium" backgroundColor="var(--color-surface)" borderRadius="var(--border-radius-medium)">
          <Stack spacing="large">
            {sampleComments.map((comment) => (
              <Comment
                key={comment.id}
                {...comment}
                onEdit={(id, content) => alert(`Edit comment ${id}: ${content}`)}
                onDelete={(id) => alert(`Delete comment ${id}`)}
                onReply={(id, content) => alert(`Reply to comment ${id}: ${content}`)}
              />
            ))}
          </Stack>
        </Box>
      </section>

      {/* Table */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-[var(--color-text)]">Table</h2>
        <Box padding="medium" backgroundColor="var(--color-surface)" borderRadius="var(--border-radius-medium)">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead sortable sortDirection="asc" onSort={() => alert('Sort by name')}>Role</TableHead>
                <TableHead align="center">Status</TableHead>
                <TableHead align="right">Last Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>John Doe</TableCell>
                <TableCell>Editor</TableCell>
                <TableCell align="center">
                  <Badge variant="success">Active</Badge>
                </TableCell>
                <TableCell align="right">2 hours ago</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Jane Smith</TableCell>
                <TableCell>Viewer</TableCell>
                <TableCell align="center">
                  <Badge variant="warning">Away</Badge>
                </TableCell>
                <TableCell align="right">1 day ago</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Bob Johnson</TableCell>
                <TableCell>Admin</TableCell>
                <TableCell align="center">
                  <Badge variant="error">Offline</Badge>
                </TableCell>
                <TableCell align="right">3 days ago</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Box>
      </section>

      {/* Side Navigation */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-[var(--color-text)]">Side Navigation</h2>
        <div className="flex h-96 border border-[var(--color-border)] rounded-lg overflow-hidden">
          <SideNavigation
            items={[
              {
                id: 'dashboard',
                label: 'Dashboard',
                icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5a2 2 0 012-2h4a2 2 0 012 2v2H8V5z" /></svg>,
              },
              {
                id: 'projects',
                label: 'Projects',
                badge: '12',
                icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>,
                children: [
                  { id: 'project-1', label: 'Video Editor' },
                  { id: 'project-2', label: 'Photo Album' },
                  { id: 'project-3', label: 'Presentation' },
                ]
              },
              {
                id: 'media',
                label: 'Media Library',
                icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2m0 0V1a1 1 0 00-1-1H8a1 1 0 00-1 1v3m0 0v3m0-3h10m-10 3l1.5 10h7L17 7" /></svg>,
              },
              {
                id: 'settings',
                label: 'Settings',
                icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
                disabled: true,
              },
            ]}
            activeItemId="media"
            header={<div className="text-sm font-semibold text-[var(--color-text)]">Artone</div>}
            footer={
              <div className="text-xs text-[var(--color-text-secondary)]">
                v1.0.0
              </div>
            }
          />
          <div className="flex-1 p-6">
            <h3 className="text-lg font-semibold text-[var(--color-text)]">Content Area</h3>
            <p className="text-[var(--color-text-secondary] mt-2">
              This is where the main content would go. The side navigation provides collapsible navigation with nested items, badges, and icons.
            </p>
          </div>
        </div>
      </section>

      {/* Modal Component */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Component Showcase"
        size="large"
        actions={[
          { label: 'Cancel', onClick: () => setShowModal(false), variant: 'secondary' },
          { label: 'Confirm', onClick: () => setShowModal(false), variant: 'primary' },
        ]}
      >
        <Stack spacing="medium">
          <p className="text-[var(--color-text)]">
            This modal demonstrates the Modal component with actions, title, and custom content.
          </p>
          <InlineMessage type="info">
            All components are fully accessible and follow Atlassian Design System guidelines.
          </InlineMessage>
        </Stack>
      </Modal>
    </Box>
  );
};

export default UIComponentsShowcase;
