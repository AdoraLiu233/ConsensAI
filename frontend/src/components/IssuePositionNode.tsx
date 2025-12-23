import { useState, useEffect, type ChangeEventHandler } from 'react';
import { type NodeProps, Position, Handle, useReactFlow } from '@xyflow/react';
import { Button, Textarea, Popover, TextInput, ActionIcon, Menu, Badge } from '@mantine/core';
import { IconCheck, IconMinus, IconPlus, IconX, IconChevronDown, IconAlertTriangle } from '@tabler/icons-react';
import type { CustomNodeType, IssueNode, PositionStatusType } from '@/lib/definitions';
import { meetingsAddNode, meetingsChooseNode, meetingsDeleteNode, meetingsModifyNode } from '@/client';
import { success, error } from '@/lib/notifications';
import { useMeetingStore } from '@/store/meetingStore';
import { getChildren, newNode } from '@/lib/utils';
import { useValueChange } from '@/hooks/useValueChange';
import { useTranslation } from 'react-i18next';


export function IssuePositionNode({ id, data, type }: NodeProps<CustomNodeType>) {
  const [editingContent, setEditingContent] = useState(data.content);
  // 如果外部的 content 变化（例如服务端推送更新），就同步
  const dataContent = useValueChange((newContent) => {
    setEditingContent(newContent);
  }, data.content);

  const { t } = useTranslation();

  const [editIndex, setEditIndex] = useState("");
  const [popoverOpened, setPopoverOpened] = useState(false);
  const [newSubNodeContent, setNewSubNodeContent] = useState("");
  const [MouseOverNode, setMouseOverNode] = useState(false);
  const [MouseOverPopover, setMouseOverPopover] = useState(false);
  const [MouseFocus, setMouseFocus] = useState(false);

  const meetingHashId = useMeetingStore(s => s.meetingHashId);
  const { updateNodeData, setNodes, getNodes, getEdges } = useReactFlow<CustomNodeType>();
  
  // 获取当前节点的状态（对 Issue 和 Position 节点都支持）
  const currentStatus = (data as any).status;
  const [localStatus, setLocalStatus] = useState<PositionStatusType | null>(currentStatus || null);
  
  // 获取歧义信息
  const ambiguity = (data as any).ambiguity;

  // 当 data.status 变化时，同步 localStatus
  useEffect(() => {
    const newStatus = (data as any).status;
    setLocalStatus(newStatus || null);
  }, [(data as any).status]);

  const shouldPopoverBeOpened = data.editable && (MouseOverNode || MouseOverPopover || MouseFocus);
  if (popoverOpened !== shouldPopoverBeOpened) {
    setPopoverOpened(shouldPopoverBeOpened);
  }

  const handleContentChange: ChangeEventHandler<HTMLTextAreaElement> = (event) => {
    setEditingContent(event.target.value);
  };

  const handleContentSave = () => {
    setEditIndex("");

    if (data.content === editingContent) {
      return;
    }
    if (!data.editable) {
      updateNodeData(id, { confirmed: true });
      return;
    }
    console.log("update content:", editingContent);
    meetingsModifyNode({
      body: { meeting_hash_id: meetingHashId, full_id: id, content: editingContent }
    }).then((res) => {
      console.log("update content:", res);
      success(t('updateSuccess'));
    }).catch((error) => {
      console.error("Error updating content:", error);
    });
    updateNodeData(id, { content: editingContent, confirmed: true });
  };

  const handleDelete = () => {
    console.log("Delete node", id);
    if (!data.editable || !data.deletable) {
      return;
    }

    meetingsDeleteNode({
      body: { meeting_hash_id: meetingHashId, full_id: id }
    }).then((res) => {
      console.log("delete node:", res);
      success(t('deleteSuccess'));
    }).catch((error) => {
      console.error("Error deleting node:", error);
    });
  };

  const handleToggleCollapse = () => {
    console.log("Toggle collapse", id);
    const collapsedNodeIds = getChildren(id, getNodes(), getEdges());
    console.log("Collapsed node IDs", collapsedNodeIds);
    const shouldCollapse = !data.isCollapsed;
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return newNode(node, { data: { isCollapsed: shouldCollapse } });
        } else if (collapsedNodeIds.includes(node.id)) {
          return newNode(node, {
            hidden: shouldCollapse,
            data: { isCollapsed: shouldCollapse }
          });
        }
        return node;
      })
    );
  };

  const handleStatusChange = (status: PositionStatusType | null) => {
    if (!meetingHashId) {
      error(t('error'), t('meetingHashIdMissing') || 'Meeting hash ID is missing');
      return;
    }

    // 根据节点类型调用不同的 API
    const apiEndpoint = type === 'issue' ? '/api/updateIssueStatus' : '/api/updatePositionStatus';

    // 调用 API 更新状态
    fetch(apiEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        meeting_hash_id: meetingHashId,
        full_id: id,
        new_status: status,
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          // 尝试解析错误响应
          let errorMessage = "Failed to update status";
          try {
            const errorData = await res.json();
            errorMessage = errorData.detail || errorData.message || errorMessage;
          } catch (e) {
            errorMessage = `HTTP ${res.status}: ${res.statusText}`;
          }
          throw new Error(errorMessage);
        }
        const data = await res.json();
        setLocalStatus(status);
        updateNodeData(id, { status: status || undefined });
        success(t('statusUpdateSuccess' as any) || "Status updated successfully");
      })
      .catch((err) => {
        console.error("Error updating status:", err);
        error(t('updateError'), err.message || 'Failed to update status.');
      });
  };

  /**
   * 用户手动在Issue结点下添加Position结点
   */
  const handleAddSubNode = (type: "ISSUE" | "POSITION") => {
    if (newSubNodeContent.trim() !== "") {
      if (data.editable === false) {
        return;
      }

      meetingsAddNode({
        body: {
          meeting_hash_id: meetingHashId,
          father_id: id,
          type,
          content: newSubNodeContent,
        }
      }).then((res) => {
        console.log("add node:", res);
        success(t('addSuccess'));
      }).catch((error) => {
        console.error("Error adding node:", error);
      });

      setPopoverOpened(false);
      setNewSubNodeContent("");
    }
  };
  
  if (type === 'issue') {
    const borderStyle = 'solid';
    const fontColor = 'black';
    const backgroundColor = '#F9D2E450';
    const opacity = 1;

    const chosen = (data as IssueNode['data']).chosen;

    const handleChosen = (id: string) => {
      console.log("Chosen node", id);
      if (data.editable === false) {
        return;
      }

      // 将之前选择的议题取消选择，将新选择的议题设置为选择
      setNodes((nds) =>
        nds.map((node) => {
          if (node.type === 'issue') {
            if (node.id === id) {
              // 当前节点：切换选中状态（未选中 → 选中）
              return node.data.chosen
                ? node
                : newNode(node, { data: { chosen: true, confirmed: true } });
            } else {
              // 其他节点：若已选中则取消
              return node.data.chosen
                ? newNode(node, { data: { chosen: false } })
                : node;
            }
          } else {
            return node;  // 非Issue节点不变
          }
        })
      );

      console.log("set chosen node", id);

      // 向后端发送请求，选择议题
      meetingsChooseNode({
        body: { meeting_hash_id: meetingHashId, chosenNodeId: id }
      }).then((res) => {
        console.log("choose node:", id, res);
      }).catch((error) => {
        console.error("Error choosing node:", error);
      });
    };

    return (
      <div
        className={'px-1 py-1 shadow-md rounded-lg'}
        style={{
          width: '300px',
          backgroundColor: backgroundColor,
          borderColor: chosen ? '#ffaf91' : 'transparent',
          borderStyle: borderStyle,
          borderWidth: '6px',
          opacity: opacity,
        }}
        onMouseEnter={() => setMouseOverNode(true)}
        onMouseLeave={() => setMouseOverNode(false)}
      >
        <Popover
          opened={popoverOpened}
          onClose={() => setPopoverOpened(false)}
          position="top"
          withArrow
          shadow="md"
          withinPortal
        >
          <Popover.Target>
            <div></div>
          </Popover.Target>
          <Popover.Dropdown onMouseLeave={() => setMouseOverPopover(false)} onMouseEnter={() => setMouseOverPopover(true)}>
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  marginBottom: '2px',
                  padding: '0px',
                  borderRadius: '4px',
                  backgroundColor: '#FFFFFF',
                  color: '#555555',
                }}
              >
                <TextInput
                  placeholder={t('newPosition')}
                  value={newSubNodeContent}
                  onChange={(event) =>
                    setNewSubNodeContent(event.currentTarget.value)
                  }
                  onFocus={() => setMouseFocus(true)}
                  onBlur={() => setMouseFocus(false)}
                  style={{
                    border: 'none',
                    borderRadius: '0',
                    padding: '2px 3px',
                    boxShadow: 'none',
                    flex: 1,
                    fontSize: '10px',
                    backgroundColor: '#FFFFFF',
                  }}
                />
                <Button
                  size="xs"
                  variant="subtle"
                  style={{
                    color: '#40C057',
                    backgroundColor: 'transparent',
                    marginLeft: '2px',
                    padding: '0 3px',
                    fontSize: '10px',
                  }}
                  onClick={() => handleAddSubNode("POSITION")}
                >
                  <IconCheck size={16} />
                </Button>
              </div>
            </div>
          </Popover.Dropdown>
        </Popover>

        <div className="flex">
          <div className="ml-2" style={{ width: '250px', color: fontColor }}>
            <div className=" custom-drag-handle text-md font-bold" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {'❓ ' + t('issue') + ' ' + id + (!data.confirmed ? ' 🤖' : '')}
              {localStatus && (
                <Badge
                  size="xs"
                  color={
                    localStatus === 'consensus' ? 'green' :
                    localStatus === 'controversial' ? 'red' :
                    'yellow'
                  }
                  variant="light"
                >
                  {localStatus === 'consensus' ? (t('statusConsensus' as any) || '达成共识') :
                   localStatus === 'controversial' ? (t('statusControversial' as any) || '存在分歧') :
                   (t('statusPending' as any) || '待延展')}
                </Badge>
              )}
            </div>
            <div className="text-gray-800">
            {data.editable ? (
                editIndex === id ? (
                <Textarea
                  value={editingContent}
                  onChange={handleContentChange}
                  onBlur={handleContentSave}
                  autoFocus
                  autosize
                  minRows={1}
                />
              ) : (
                <div onClick={() => setEditIndex(id)}>
                  {dataContent}
                </div>
              )
            ) : (
              <div>
                {dataContent}
              </div>
            )}
            </div>
            {ambiguity && (
              <div style={{
                marginTop: '4px',
                padding: '6px',
                backgroundColor: '#FFF3E0',
                border: '1px solid #FFB74D',
                borderRadius: '4px',
                fontSize: '12px',
                color: '#E65100',
                display: 'flex',
                alignItems: 'start',
                gap: '4px',
                lineHeight: '1.4'
              }}>
                <IconAlertTriangle size={14} style={{ marginTop: '2px', flexShrink: 0 }} />
                <span>{ambiguity}</span>
              </div>
            )}
          </div>

          <div
            className="flex flex-col"
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                marginBottom: '5px',
                gap: '4px',
              }}
            >
              {data.editable && type === 'issue' && (
                <Menu shadow="md" width={150}>
                  <Menu.Target>
                    <ActionIcon 
                      size="xs" 
                      variant="outline" 
                      color={localStatus ?
                        (localStatus === 'consensus' ? 'green' :
                         localStatus === 'controversial' ? 'red' :
                         'yellow') : 'gray'
                      }
                    >
                      <IconChevronDown size={12} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item onClick={() => handleStatusChange('consensus')}>
                      {t('statusConsensus' as any) || '达成共识'}
                    </Menu.Item>
                    <Menu.Item onClick={() => handleStatusChange('controversial')}>
                      {t('statusControversial' as any) || '存在分歧'}
                    </Menu.Item>
                    <Menu.Item onClick={() => handleStatusChange('pending')}>
                      {t('statusPending' as any) || '待延展'}
                    </Menu.Item>
                    {localStatus && (
                      <Menu.Item onClick={() => handleStatusChange(null)} color="gray">
                        {t('clearStatus' as any) || '清除状态'}
                      </Menu.Item>
                    )}
                  </Menu.Dropdown>
                </Menu>
              )}
              <ActionIcon size="xs" variant="outline" onClick={handleToggleCollapse}>
                {data.isCollapsed ? <IconPlus size={16} /> : <IconMinus size={16} />}
              </ActionIcon>
              <ActionIcon size="xs" variant="outline" color='red' style={{ marginLeft: '4px' }} onClick={handleDelete}>
                <IconX size={16} />
              </ActionIcon>
            </div>

            { !chosen ? (
              <Button
                size="xs"
                variant="subtle"
                onClick={() => handleChosen(id)}
              >
                {t('focus')}
              </Button>
            ) : (
              <Button
                size="xs"
                variant="subtle"
                onClick={() => handleChosen('-1')}
              >
                {t('unfocus')}
              </Button>
            )}

          </div>
        </div>

        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />
      </div>
    );
  } else {
    return (
      <div
        className={'px-1 py-1 shadow-md rounded-lg border-stone-400'}
        style={{
          width: '350px', backgroundColor: '#E5EB1570', borderColor: 'transparent', borderWidth: '6px'
        }}
        onMouseEnter={() => setMouseOverNode(true)}
        onMouseLeave={() => setMouseOverNode(false)}
      >
        <Popover
          opened={popoverOpened}
          onClose={() => setPopoverOpened(false)}
          position="top" // 设置为向上弹出
          withArrow
          shadow="md"
        >
          <Popover.Target>
            <div></div>
          </Popover.Target>
          <Popover.Dropdown onMouseLeave={() => setMouseOverPopover(false)} onMouseEnter={() => setMouseOverPopover(true)}>
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  marginBottom: '2px',
                  padding: '0px',
                  borderRadius: '4px',
                  backgroundColor: '#FFFFFF',
                  color: '#555555',
                }}
              >
                <TextInput
                  placeholder={t('newIssue')}
                  onFocus={() => setMouseFocus(true)}
                  onBlur={() => setMouseFocus(false)}
                  value={newSubNodeContent}
                  onChange={(event) =>
                    setNewSubNodeContent(event.currentTarget.value)
                  }
                  style={{
                    border: 'none',
                    borderRadius: '0',
                    padding: '2px 3px',
                    boxShadow: 'none',
                    flex: 1,
                    fontSize: '10px',
                    backgroundColor: '#FFFFFF',
                  }}
                />
                <Button
                  size="xs"
                  variant="subtle"
                  style={{
                    color: '#40C057',
                    backgroundColor: 'transparent',
                    marginLeft: '2px',
                    padding: '0 3px',
                    fontSize: '10px',
                  }}
                  onClick={() => handleAddSubNode("ISSUE")}
                >
                  <IconCheck size={16} />
                </Button>
              </div>
            </div>
          </Popover.Dropdown>
        </Popover>

        <div className="flex">
          <div className="ml-2" style={{ width: '300px' }}>
            <div className=" custom-drag-handle text-md font-bold" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {'💡 ' + t('position') + ' ' + id + (!data.confirmed ? ' 🤖' : '')}
              {localStatus && (
                <Badge
                  size="xs"
                  color={
                    localStatus === 'consensus' ? 'green' :
                    localStatus === 'controversial' ? 'red' :
                    'yellow'
                  }
                  variant="light"
                >
                  {localStatus === 'consensus' ? (t('statusConsensus' as any) || '达成共识') :
                   localStatus === 'controversial' ? (t('statusControversial' as any) || '存在分歧') :
                   (t('statusPending' as any) || '待延展')}
                </Badge>
              )}
            </div>
            <div className="text-gray-800">
            {data.editable ? (
                editIndex === id ? (
                  <Textarea
                    value={editingContent}
                    onChange={handleContentChange}
                    onBlur={handleContentSave}
                    autoFocus
                    autosize
                    minRows={1}
                  />
                ) : (
                  <div onClick={() => setEditIndex(id)}>
                    {dataContent}
                  </div>
                )
              ) : (
                <div>
                  {dataContent}
                </div>
              )}
            </div>
            
            {/* 歧义提醒 */}
            {ambiguity && (
              <div className="mt-2 p-2 bg-orange-50 border border-orange-200 rounded-md flex items-start gap-2">
                <IconAlertTriangle size={16} className="text-orange-500 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-orange-800">
                  <div className="font-bold mb-0.5">{t('ambiguityTitle') || '歧义澄清'}</div>
                  {ambiguity}
                </div>
              </div>
            )}
          </div>
          <div
            className="flex flex-col"
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                marginBottom: '5px',
                gap: '4px',
              }}
            >
              {data.editable && type === 'position' && (
                <Menu shadow="md" width={150}>
                  <Menu.Target>
                    <ActionIcon 
                      size="xs" 
                      variant="outline" 
                      color={localStatus ?
                        (localStatus === 'consensus' ? 'green' :
                         localStatus === 'controversial' ? 'red' :
                         'yellow') : 'gray'
                      }
                    >
                      <IconChevronDown size={12} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item onClick={() => handleStatusChange('consensus')}>
                      {t('statusConsensus' as any) || '达成共识'}
                    </Menu.Item>
                    <Menu.Item onClick={() => handleStatusChange('controversial')}>
                      {t('statusControversial' as any) || '存在分歧'}
                    </Menu.Item>
                    <Menu.Item onClick={() => handleStatusChange('pending')}>
                      {t('statusPending' as any) || '待延展'}
                    </Menu.Item>
                    {localStatus && (
                      <Menu.Item onClick={() => handleStatusChange(null)} color="gray">
                        {t('clearStatus' as any) || '清除状态'}
                      </Menu.Item>
                    )}
                  </Menu.Dropdown>
                </Menu>
              )}
              <ActionIcon size="xs" variant="outline" onClick={handleToggleCollapse}>
                {data.isCollapsed ? <IconPlus size={16} /> : <IconMinus size={16} />}
              </ActionIcon>
              <ActionIcon size="xs" variant="outline" color='red' style={{ marginLeft: '4px' }} onClick={handleDelete}>
                <IconX size={16} />
              </ActionIcon>
            </div>
          </div>
        </div>

        <Handle
          type="target"
          position={Position.Left}
        />
        <Handle
          type="source"
          position={Position.Right}
        />
      </div>
    );
  }
};
